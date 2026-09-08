import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSourceFor, createAvatarProxy } from './avatars.js';
import { createApp } from './app.js';
import { listenForTest } from './test-helpers.js';

const uin = '123456789';
const source = `https://q.qlogo.cn/g?b=qq&s=100&nk=${uin}`;
const row = { uin, botVersion: 'OneBotv11', avatarUrl: `https://q.qlogo.cn/g?b=qq&s=0&nk=${uin}` };
const qqBotRow = { uin: 'official-bot-id', botVersion: 'QQBot', avatarUrl: 'http://thirdqq.qlogo.cn/g?b=oidb&k=private-avatar-signature&kti=123&s=100&t=456' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1EAAAAASUVORK5CYII=', 'base64');
const image = (headers = {}) => new Response(png, { headers: { 'Content-Type': 'image/png', ...headers } });

test('UIN-based QQ avatars are limited to OneBot v11 and ICQQ', () => {
  for (const botVersion of ['OneBotv11', 'OneBot v11', 'ICQQ v1.12.3', 'icqq']) assert.equal(avatarSourceFor({ ...row, botVersion }), source);
  for (const botVersion of ['QQBot', 'QQBot 沙盒', 'JumpByte', 'OneBotv12', 'OneBotv111', 'Satori', 'Other ICQQ', '']) {
    assert.equal(avatarSourceFor({ ...row, botVersion, nickname: 'ICQQ', platform: 'OneBotv11' }), null);
  }
});

test('QQBot signed avatars preserve required parameters and upgrade the known endpoint to HTTPS', () => {
  const source = avatarSourceFor(qqBotRow);
  assert.equal(source, qqBotRow.avatarUrl.replace('http:', 'https:'));
  assert.equal(avatarSourceFor({ ...qqBotRow, botVersion: 'QQBot 沙盒' }), source);
  assert.equal(avatarSourceFor({ ...qqBotRow, avatarUrl: `${qqBotRow.avatarUrl}&unexpected=secret` }), source);
  assert.equal(avatarSourceFor({ ...qqBotRow, avatarUrl: 'default' }), null);
});

test('signed avatars cannot enable other adapters or arbitrary hosts, credentials, ports or paths', () => {
  for (const botVersion of ['QQBotFake', 'JumpByte', 'OneBotv11', 'ICQQ']) assert.equal(avatarSourceFor({ ...qqBotRow, botVersion }), null);
  for (const avatarUrl of [
    qqBotRow.avatarUrl.replace('thirdqq.qlogo.cn', 'thirdqq.qlogo.cn.evil.example'),
    qqBotRow.avatarUrl.replace('thirdqq.qlogo.cn', 'user:pass@thirdqq.qlogo.cn'),
    qqBotRow.avatarUrl.replace('thirdqq.qlogo.cn', 'thirdqq.qlogo.cn:8080'),
    qqBotRow.avatarUrl.replace('/g?', '/admin?'),
    qqBotRow.avatarUrl.replace('b=oidb', 'b=other'),
    'https://thirdqq.qlogo.cn/g?b=oidb',
  ]) assert.equal(avatarSourceFor({ ...qqBotRow, avatarUrl }), null);
});

test('avatar sources must be recognized QQ URLs matching the private account UIN', () => {
  for (const avatarUrl of [
    'http://127.0.0.1/admin', `https://q.qlogo.cn.evil.example/g?b=qq&nk=${uin}`, `https://evil.example/g?b=qq&nk=${uin}`,
    `https://user:pass@q.qlogo.cn/g?b=qq&nk=${uin}`, `https://q.qlogo.cn:8080/g?b=qq&nk=${uin}`,
    'https://q.qlogo.cn/g?b=qq&nk=987654321', `https://q.qlogo.cn/other?b=qq&nk=${uin}`, 'default',
  ]) assert.equal(avatarSourceFor({ ...row, avatarUrl }), null, avatarUrl);
  assert.equal(avatarSourceFor({ ...row, uin: 'adapter-name' }), null);
});

test('successful images are cached for exactly an hour with a decreasing browser max-age', async () => {
  let clock = 0;
  let calls = 0;
  const proxy = createAvatarProxy({ now: () => clock, fetchImpl: async () => { calls++; return image(); } });
  assert.equal((await proxy.get('id', source)).maxAge, 3600);
  clock = 3_599_000;
  assert.equal((await proxy.get('id', source)).maxAge, 1);
  assert.equal(calls, 1);
  clock = 3_600_000;
  assert.equal((await proxy.get('id', source)).maxAge, 3600);
  assert.equal(calls, 2);
});

test('parallel image requests share one download and a changed source invalidates the cached image', async () => {
  let calls = 0;
  const proxy = createAvatarProxy({ fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return image(); } });
  const results = await Promise.all(Array.from({ length: 8 }, () => proxy.get('id', source)));
  assert.ok(results.every(result => result.bytes.equals(png)));
  assert.equal(calls, 1);
  await proxy.get('id', source.replace('q.qlogo.cn', 'q1.qlogo.cn'));
  assert.equal(calls, 2);
});

test('unsafe redirects are stopped before making a request to their target', async () => {
  let calls = 0;
  const proxy = createAvatarProxy({ fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers['guoba-access-token'], undefined);
    return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
  } });
  await assert.rejects(proxy.get('id', source), /AVATAR_UNAVAILABLE/);
  assert.equal(calls, 1);
});

test('redirects within the QQ avatar CDN are followed on the server', async () => {
  let calls = 0;
  const proxy = createAvatarProxy({ fetchImpl: async url => {
    calls++;
    return url.hostname === 'q.qlogo.cn' ? new Response(null, { status: 302, headers: { Location: 'https://q1.qlogo.cn/image.png' } }) : image();
  } });
  assert.ok((await proxy.get('id', source)).bytes.equals(png));
  assert.equal(calls, 2);
});

test('invalid types, false image headers, and oversized streamed bodies are rejected', async () => {
  const responses = [
    () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    () => new Response('<html>error</html>', { headers: { 'Content-Type': 'image/png' } }),
    () => image({ 'Content-Length': '3000000' }),
    () => new Response(Buffer.alloc(150), { headers: { 'Content-Type': 'image/png' } }),
  ];
  for (const response of responses) {
    const proxy = createAvatarProxy({ maxBytes: 100, fetchImpl: async () => response() });
    await assert.rejects(proxy.get('id', source), /AVATAR_UNAVAILABLE/);
  }
});

test('image failures cool down for a minute and retry afterward', async () => {
  let clock = 0;
  let calls = 0;
  const proxy = createAvatarProxy({ now: () => clock, fetchImpl: async () => { if (++calls === 1) throw new Error(source); return image(); } });
  await assert.rejects(proxy.get('id', source), /^Error: AVATAR_UNAVAILABLE$/);
  clock = 59_999;
  await assert.rejects(proxy.get('id', source));
  assert.equal(calls, 1);
  clock = 60_000;
  assert.ok((await proxy.get('id', source)).bytes.equals(png));
  assert.equal(calls, 2);
});

test('public proxy accepts only registered opaque account IDs and does not leak upstream headers', async () => {
  let avatarCalls = 0;
  const ok = result => new Response(JSON.stringify({ ok: true, code: 0, result }));
  const app = createApp({
    baseUrl: 'http://ai.example', apiKey: '',
    guoba: { baseUrl: 'http://guoba.example/guoba', account: 'panel-admin', password: 'panel-password', fetchImpl: async url => url.pathname.endsWith('/account-password')
      ? ok({ token: 'private-token' }) : ok({ list: [row, { ...row, uin: '987654321', botVersion: 'JumpByte' }, qqBotRow] }) },
    avatars: { fetchImpl: async () => { avatarCalls++; return image({ 'Set-Cookie': 'session=secret', 'Content-Location': source, 'X-Private-Uin': uin }); } },
  });
  const server = await listenForTest(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const data = await (await fetch(`${base}/api/accounts`)).json();
    const [allowed, other, qqBot] = data.data.list;
    assert.match(allowed.avatarPath, /^\/api\/accounts\/[a-f0-9]{24}\/avatar$/);
    assert.equal(other.avatarPath, null);
    assert.ok(!JSON.stringify(data).includes(uin));
    assert.ok(!JSON.stringify(data).includes('qlogo.cn'));
    assert.match(qqBot.avatarPath, /^\/api\/accounts\/[a-f0-9]{24}\/avatar$/);
    assert.ok(!JSON.stringify(data).includes('private-avatar-signature'));
    assert.ok(!JSON.stringify(data).includes(qqBotRow.uin));
    for (const path of [`/api/accounts/${uin}/avatar`, '/api/accounts/000000000000000000000000/avatar', `/api/accounts/${other.id}/avatar?url=${encodeURIComponent(source)}`]) assert.equal((await fetch(`${base}${path}`)).status, 404);
    assert.equal(avatarCalls, 0);
    const response = await fetch(`${base}${allowed.avatarPath}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
    for (const name of ['set-cookie', 'content-location', 'x-private-uin', 'location']) assert.equal(response.headers.get(name), null);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(png));
    await (await fetch(`${base}${allowed.avatarPath}`)).arrayBuffer();
    assert.equal(avatarCalls, 1);
    const officialAvatar = await fetch(`${base}${qqBot.avatarPath}`);
    assert.equal(officialAvatar.status, 200);
    assert.equal(officialAvatar.headers.get('cache-control'), 'public, max-age=3600');
    assert.ok(Buffer.from(await officialAvatar.arrayBuffer()).equals(png));
    assert.equal(avatarCalls, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
