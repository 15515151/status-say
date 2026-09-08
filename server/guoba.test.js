import test from 'node:test';
import assert from 'node:assert/strict';
import { listenForTest } from './test-helpers.js';
import { createGuobaClient, maskUin, sanitizeAccounts } from './guoba.js';
import { createApp } from './app.js';

const account = 'test-panel-admin';
const password = 'test-private-password';
const uin = '123456789';
const baseUrl = 'http://guoba.example:2536/guoba';
const success = result => ({ ok: true, code: 0, result, message: 'ok' });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const online = success({ list: [{
  uin, nickname: '香菜', status: 11,
  avatarUrl: `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uin}`,
  platform: 'Linux v1', botVersion: 'ICQQ v2', botRunTime: '2天3时4分',
  messageCount: { sent: '128 收', recv: '256 发' },
  countContacts: { friend: '12 好友', group: '34 群组', groupMember: '567 群员' },
}], total: 1 });
const client = options => createGuobaClient({ baseUrl, account, password, cacheMs: 0, ...options });

test('account whitelist masks UIN everywhere and discards avatars and private fields', () => {
  const raw = structuredClone(online);
  Object.assign(raw.result.list[0], { nickname: `香菜 ${uin}`, botVersion: `ICQQ ${uin} ${password}`, token: 'private-token' });
  const data = sanitizeAccounts(raw, { secrets: [password] });
  const body = JSON.stringify(data);
  for (const privateValue of [uin, password, 'private-token', 'avatarUrl', 'qlogo.cn']) assert.ok(!body.includes(privateValue), privateValue);
  assert.equal(data.list[0].maskedUin, '12****89');
  assert.equal(data.list[0].messages.sent, 128);
  assert.equal(data.list[0].messages.received, 256);
  assert.equal(data.list[0].contacts.members, 567);
  assert.equal(data.list[0].connected, true);
  assert.equal(maskUin('1234'), '****');
  assert.equal(maskUin('adapter-abcdef'), 'ad****ef');
});

test('account status and absent counts are not invented', () => {
  const data = sanitizeAccounts(success({ list: [{ uin: 123, status: 50 }, { uin: 456, status: 0 }, { uin: 789, status: null }] }));
  assert.equal(data.list[0].statusLabel, '隐身');
  assert.equal(data.list[1].connected, false);
  assert.equal(data.list[2].connected, null);
  assert.equal(data.list[2].messages.sent, null);
  assert.throws(() => sanitizeAccounts(success({ list: {} })));
});

test('unconfigured integration never tries to log in', async () => {
  const service = createGuobaClient({ fetchImpl: () => { throw new Error('Must not fetch'); } });
  assert.deepEqual(await service.getAccounts(), { configured: false, data: null, fetchedAt: null, error: null, retryAt: null });
});

test('logs in with JSON credentials and reuses token and cookies only on fixed upstream paths', async () => {
  let logins = 0;
  const service = client({ fetchImpl: async (url, options) => {
    assert.equal(url.origin, 'http://guoba.example:2536');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname === '/guoba/api/login/account-password') {
      logins++;
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { account, password });
      return json(success({ token: 'private-session-token', userInfo: { account } }), 200, { 'Set-Cookie': 'session=private-cookie; Path=/guoba; HttpOnly; Max-Age=86400' });
    }
    assert.equal(url.pathname, '/guoba/api/bot/online-list');
    assert.equal(options.headers['guoba-access-token'], 'private-session-token');
    assert.equal(options.headers.Cookie, 'session=private-cookie');
    return json(online);
  } });
  const first = await service.getAccounts();
  const second = await service.getAccounts();
  assert.equal(first.error, null);
  assert.equal(logins, 1);
  assert.equal(first.data.list[0].id, second.data.list[0].id);
  for (const secret of [uin, account, password, 'private-session-token', 'private-cookie']) assert.ok(!JSON.stringify(first).includes(secret));
});

for (const httpStatus of [401, 200]) test(`HTTP ${httpStatus} with auth expiry reauthenticates and replays once`, async () => {
  let logins = 0;
  let reads = 0;
  const service = client({ fetchImpl: async (url, options) => {
    if (url.pathname.endsWith('/account-password')) return json(success({ token: `session-${++logins}` }));
    reads++;
    if (reads === 2) return json({ ok: false, code: 401, message: 'expired' }, httpStatus);
    assert.equal(options.headers['guoba-access-token'], `session-${logins}`);
    return json(online);
  } });
  assert.equal((await service.getAccounts()).error, null);
  assert.equal((await service.getAccounts()).error, null);
  assert.equal(logins, 2);
  assert.equal(reads, 3);
});

test('expired replacement session stops after a single retry and cools down', async () => {
  let calls = 0;
  const service = client({ fetchImpl: async url => {
    calls++;
    return url.pathname.endsWith('/account-password') ? json(success({ token: 'session-token' })) : json({ ok: false, code: 401 }, 401);
  } });
  const result = await service.getAccounts();
  assert.ok(result.error);
  assert.equal(result.data, null);
  assert.ok(result.retryAt);
  await service.getAccounts();
  assert.equal(calls, 4);
});

test('credentials failure has a 60 second cooldown without leaking upstream error text', async () => {
  let clock = Date.now();
  let calls = 0;
  const service = client({ now: () => clock, fetchImpl: async () => {
    calls++;
    return json({ ok: false, code: -1, message: `${account} ${password}` });
  } });
  const result = await service.getAccounts();
  assert.ok(result.error);
  assert.ok(!JSON.stringify(result).includes(password));
  clock += 59_000;
  await service.getAccounts();
  assert.equal(calls, 1);
  clock += 1_001;
  await service.getAccounts();
  assert.equal(calls, 2);
});

test('permission failures do not trigger pointless re-login', async () => {
  let logins = 0;
  const service = client({ fetchImpl: async url => {
    if (url.pathname.endsWith('/account-password')) { logins++; return json(success({ token: 'token' })); }
    return json({ ok: false, code: 403 }, 403);
  } });
  assert.ok((await service.getAccounts()).error.includes('访问受限'));
  assert.equal(logins, 1);
});

test('renewal happens before the plugin 24-hour Redis session expiry', async () => {
  let clock = Date.now();
  let logins = 0;
  const service = client({ now: () => clock, fetchImpl: async url => url.pathname.endsWith('/account-password') ? json(success({ token: `token-${++logins}` })) : json(online) });
  await service.getAccounts();
  clock += 24 * 3600_000 - 120_000;
  await service.getAccounts();
  assert.equal(logins, 1);
  clock += 61_000;
  await service.getAccounts();
  assert.equal(logins, 2);
});

test('JWT exp shortens the refresh deadline', async () => {
  let clock = Date.now();
  let logins = 0;
  const service = client({ now: () => clock, fetchImpl: async url => {
    if (!url.pathname.endsWith('/account-password')) return json(online);
    logins++;
    const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(clock / 1000) + 300 })).toString('base64url')}.signature`;
    return json(success({ token }));
  } });
  await service.getAccounts();
  clock += 250_000;
  await service.getAccounts();
  assert.equal(logins, 2);
});

test('cookie-only sessions honor path, expiry, and replacement cookies', async () => {
  let clock = Date.now();
  let logins = 0;
  const service = client({ now: () => clock, fetchImpl: async (url, options) => {
    if (url.pathname.endsWith('/account-password')) {
      logins++;
      return json(success({}), 200, { 'Set-Cookie': `session=value-${logins}; Path=/guoba; Max-Age=300; HttpOnly` });
    }
    assert.equal(options.headers.Cookie, `session=value-${logins}`);
    assert.equal(options.headers['guoba-access-token'], undefined);
    return json(online);
  } });
  assert.equal((await service.getAccounts()).error, null);
  clock += 250_000;
  assert.equal((await service.getAccounts()).error, null);
  assert.equal(logins, 2);
});

test('cookie rotation on account responses is retained', async () => {
  let reads = 0;
  const service = client({ fetchImpl: async (url, options) => {
    if (url.pathname.endsWith('/account-password')) return json(success({ token: 'token' }), 200, { 'Set-Cookie': 'sid=first; Path=/guoba; HttpOnly' });
    assert.equal(options.headers.Cookie, reads++ === 0 ? 'sid=first' : 'sid=second');
    return json(online, 200, { 'Set-Cookie': 'sid=second; Path=/guoba; HttpOnly' });
  } });
  assert.equal((await service.getAccounts()).error, null);
  assert.equal((await service.getAccounts()).error, null);
});

test('concurrent visitors share login, fetch, expiry recovery and the result cache', async () => {
  let logins = 0;
  let reads = 0;
  const service = client({ cacheMs: 10_000, fetchImpl: async url => {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (url.pathname.endsWith('/account-password')) return json(success({ token: `token-${++logins}` }));
    if (++reads === 1) return json({ ok: false, code: 401 }, 401);
    return json(online);
  } });
  const results = await Promise.all(Array.from({ length: 8 }, () => service.getAccounts()));
  assert.ok(results.every(result => result.error === null));
  await service.getAccounts();
  assert.equal(logins, 2);
  assert.equal(reads, 2);
});

test('timeout and malformed payloads return sanitized errors', async () => {
  for (const fetchImpl of [async () => { throw new Error(password); }, async () => new Response('not JSON'), async () => json(success({}))]) {
    const result = await client({ fetchImpl }).getAccounts();
    assert.ok(result.error);
    assert.ok(!JSON.stringify(result).includes(password));
  }
});

test('malformed upstream URL does not send credentials', async () => {
  const service = client({ baseUrl: 'http://user:password@guoba.example/guoba', fetchImpl: () => { throw new Error('Must not fetch'); } });
  assert.ok((await service.getAccounts()).error.includes('配置有误'));
});

test('public accounts route works independently of AI config and exposes no session headers', async () => {
  const app = createApp({ baseUrl: 'http://ai.example', apiKey: '', guoba: { baseUrl, account, password, fetchImpl: async url => url.pathname.endsWith('/account-password') ? json(success({ token: 'private-token' }), 200, { 'Set-Cookie': 'sid=private-cookie; Path=/guoba; HttpOnly' }) : json(online) } });
  const server = await listenForTest(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounts?uin=raw&url=http://evil.example`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('guoba-access-token'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    for (const secret of [uin, account, password, 'private-token', 'private-cookie', 'guoba.example']) assert.ok(!body.includes(secret));
    assert.equal(JSON.parse(body).data.total, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
