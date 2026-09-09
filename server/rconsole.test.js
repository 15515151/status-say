import test from 'node:test';
import assert from 'node:assert/strict';
import { createRconsoleClient, sanitizeParseStats } from './rconsole.js';
import { createApp } from './app.js';
import { listenForTest } from './test-helpers.js';

const privateValue = 'private-name-123456789';
const payload = () => ({ code: 0, message: privateValue, data: {
  mode: 'global', totalParses: 100, totalUsers: 7, totalGroups: 3,
  topGroups: [{ groupId: '123456789', name: privateValue, groupAvatar: 'https://example.com/private-avatar' }],
  topUsers: [{ userId: '987654321', name: privateValue }], tplFile: 'G:/Yunzai/private-file',
  platformRows: [{ name: '哔哩哔哩', count: 90, avatar: privateValue }, { name: privateValue, count: 6 }, { name: 'https://secret.test', count: 4 }],
  platformDonut: { gradient: privateValue },
  historyRows: [{ date: '09-09', total: 10, mediaSec: 120, userId: privateValue, platforms: { [privateValue]: 10 } }],
  media: { successCount: 98, failureCount: 2, successRate: 100,
    videoDurationText: '2小时10分', audioDurationText: '3分12秒', totalMediaDurationText: '2小时13分',
    avgMediaText: '1分23秒', maxMediaText: '30分0秒', avgProcessText: '40.9秒', maxProcessText: '2分12秒',
    totalBytesText: '1.23 GB', avgBytesText: '10.5 MB', durationSamples: 90, sizeSamples: 80, token: privateValue },
} });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('statistics response contains only anonymous aggregate fields at every level', () => {
  const result = sanitizeParseStats(payload());
  assert.deepEqual(Object.keys(result), ['totalParses', 'totalUsers', 'platforms', 'history', 'media']);
  assert.deepEqual(result.platforms, [{ name: '哔哩哔哩', count: 90 }, { name: '其他', count: 10 }]);
  assert.deepEqual(result.history, [{ date: '09-09', count: 10, mediaSeconds: 120 }]);
  assert.equal(result.media.successRate, 98);
  assert.equal(result.media.totalDuration, '2小时13分');
  const body = JSON.stringify(result);
  for (const forbidden of [privateValue, '123456789', '987654321', 'private-avatar', 'https:', 'G:/', 'topGroups', 'topUsers', 'totalGroups', 'gradient', 'token']) assert.ok(!body.includes(forbidden), forbidden);
});

test('free text cannot be smuggled through media values, dates or numeric fields', () => {
  const raw = payload();
  raw.data.totalUsers = privateValue;
  raw.data.media.avgProcessText = privateValue;
  raw.data.media.videoDurationText = '1秒\nCookie=private';
  raw.data.media.totalBytesText = '1 GB https://secret.test';
  raw.data.media.sizeSamples = -1;
  raw.data.historyRows[0].total = '123456789';
  raw.data.historyRows[0].mediaSec = null;
  const data = sanitizeParseStats(raw);
  assert.equal(data.totalUsers, null);
  assert.equal(data.media.averageProcessTime, null);
  assert.equal(data.media.videoDuration, null);
  assert.equal(data.media.totalBytes, null);
  assert.equal(data.media.sizeSamples, null);
  assert.deepEqual(data.history[0], { date: '09-09', count: null, mediaSeconds: null });
  for (const date of ['02-31', '09-09?group=123456789', privateValue]) {
    raw.data.historyRows[0].date = date;
    assert.throws(() => sanitizeParseStats(raw));
  }
});

test('zero attempts or absent counts never become a fabricated 100 percent success rate', () => {
  const raw = payload();
  raw.data.media = { successCount: 0, failureCount: 0, successRate: 100 };
  assert.equal(sanitizeParseStats(raw).media.successRate, null);
  raw.data.media = {};
  assert.equal(sanitizeParseStats(raw).media.successRate, null);
  for (const value of [null, {}, { code: 503 }, { code: 0, data: { ...raw.data, mode: 'group' } }]) assert.throws(() => sanitizeParseStats(value));
  raw.data.platformRows[0].count = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => sanitizeParseStats(raw));
});

test('client requests only the global JSON endpoint with no AI key, cookies or account credentials', async () => {
  let calls = 0;
  let clock = 100_000;
  const client = createRconsoleClient({ guobaBaseUrl: 'http://yunzai.example:2536/guoba', now: () => clock, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.href, 'http://yunzai.example:2536/rconsole/api/parse-stats/global');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return json(payload());
  } });
  const snapshots = await Promise.all(Array.from({ length: 5 }, () => client.getStats()));
  assert.equal(calls, 1);
  assert.ok(snapshots.every(value => value.error === null && value.data.totalParses === 100));
  await client.getStats();
  assert.equal(calls, 1);
  clock += 30_001;
  await client.getStats();
  assert.equal(calls, 2);
});

test('upstream errors are sanitized and cached for a bounded retry cooldown', async () => {
  let clock = 100_000;
  let calls = 0;
  const client = createRconsoleClient({ baseUrl: 'http://yunzai.example', now: () => clock, fetchImpl: async () => { calls++; throw new Error(privateValue); } });
  const failure = await client.getStats();
  assert.equal(failure.data, null);
  assert.equal(Date.parse(failure.retryAt), 160_000);
  assert.ok(!JSON.stringify(failure).includes(privateValue));
  await client.getStats();
  assert.equal(calls, 1);
  clock = 160_001;
  await client.getStats();
  assert.equal(calls, 2);
});

test('disabled or invalid configuration never contacts upstream', async () => {
  const fetchImpl = () => assert.fail('must not fetch');
  assert.equal((await createRconsoleClient({ fetchImpl }).getStats()).configured, false);
  assert.equal((await createRconsoleClient({ baseUrl: '', guobaBaseUrl: 'http://yunzai.example/guoba', fetchImpl }).getStats()).configured, false);
  for (const baseUrl of ['file:///secret', 'http://name:password@yunzai.example', 'http://yunzai.example?token=secret', 'http://yunzai.example/#secret', 'invalid']) {
    assert.ok((await createRconsoleClient({ baseUrl, fetchImpl }).getStats()).error);
  }
});

test('malformed, oversized, redirect and non-JSON responses fail without exposing raw bodies', async () => {
  for (const response of [
    new Response(privateValue, { status: 503 }),
    new Response(null, { status: 302, headers: { Location: 'http://secret.test' } }),
    new Response(privateValue, { headers: { 'Content-Type': 'image/png' } }),
    new Response(privateValue, { headers: { 'Content-Type': 'application/json' } }),
    new Response(' '.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' } }),
  ]) {
    const result = await createRconsoleClient({ baseUrl: 'http://yunzai.example', fetchImpl: async () => response }).getStats();
    assert.ok(result.error);
    assert.equal(result.data, null);
    assert.ok(!JSON.stringify(result).includes(privateValue));
  }
});

test('public route rejects group, image and URL queries and works independently of AI and Guoba login', async () => {
  let calls = 0;
  const app = createApp({ baseUrl: 'http://ai.example', rconsole: { baseUrl: 'http://yunzai.example', fetchImpl: async () => { calls++; return json(payload()); } } });
  const server = await listenForTest(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/api/parse-stats?group_id=123456789', '/api/parse-stats?format=image', '/api/parse-stats?url=http://secret.test']) {
      assert.equal((await fetch(base + path)).status, 400);
    }
    assert.equal((await fetch(base + '/api/parse-stats/group')).status, 404);
    assert.equal(calls, 0);
    const response = await fetch(base + '/api/parse-stats');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const body = await response.json();
    assert.equal(body.data.media.successRate, 98);
    assert.ok(!JSON.stringify(body).includes(privateValue));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
