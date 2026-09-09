import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmoClient, sanitizeGroupStats } from './emo.js';
import { createApp } from './app.js';
import { listenForTest } from './test-helpers.js';

const privateValue = 'private-upstream-value';
const payload = () => ({ code: 200, message: privateValue, partial: false, updatedAt: '2026-09-09T08:42:14.02Z', data: {
  oneBotCount: 1, icqqCount: 1, skippedBots: 4, loadedBots: 2, failedBots: 0, cachedBots: 0, offlineBots: 0,
  totalGroups: 12, uniqueGroups: 9, duplicateGroups: 3,
  groups: [{ groupId: '123456789', name: privateValue }], token: privateValue,
  bots: [
    { botId: '36***82', type: 'ICQQ', groupCount: 7, uniqueGroupCount: 7, status: '已读取', nickname: privateValue },
    { botId: '123456789', type: 'OneBot', groupCount: 5, uniqueGroupCount: 2, status: '已读取', groups: [privateValue] },
  ],
} });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('group statistics preserve upstream deduplication counts and timestamp, publishing only safe fields', () => {
  const result = sanitizeGroupStats(payload());
  assert.equal(result.data.totalGroups, 12);
  assert.equal(result.data.uniqueGroups, 9);
  assert.equal(result.data.duplicateGroups, 3);
  assert.equal(result.updatedAt, '2026-09-09T08:42:14.020Z');
  assert.equal(result.partial, false);
  assert.deepEqual(result.data.bots, [
    { botId: '36***82', type: 'ICQQ', groupCount: 7, uniqueGroupCount: 7, status: '已读取' },
    { botId: '12***89', type: 'OneBot', groupCount: 5, uniqueGroupCount: 2, status: '已读取' },
  ]);
  for (const forbidden of [privateValue, '123456789', 'groupId', 'nickname', 'token', 'message']) assert.ok(!JSON.stringify(result).includes(forbidden), forbidden);
  const raw = payload();
  Object.assign(raw.data.bots[0], { botId: privateValue, type: privateValue, status: privateValue });
  assert.deepEqual(sanitizeGroupStats(raw).data.bots[0], { botId: '***', type: '其他', groupCount: 7, uniqueGroupCount: 7, status: '未知' });
});

test('failed, cached and offline bots remain distinguishable from successfully read empty group lists', () => {
  const raw = payload();
  Object.assign(raw.data, { failedBots: 2, cachedBots: 1, offlineBots: 1 });
  raw.data.bots[0].status = '使用缓存';
  raw.data.bots.push({ botId: '12***34', type: 'OneBot', groupCount: 0, uniqueGroupCount: 0, status: '获取失败' },
    { botId: '56***78', type: 'ICQQ', groupCount: 0, uniqueGroupCount: 0, status: '离线' });
  const result = sanitizeGroupStats(raw);
  assert.equal(result.partial, true);
  assert.equal(result.data.cachedBots, 1);
  assert.equal(result.data.offlineBots, 1);
  assert.deepEqual(result.data.bots.map(bot => bot.status), ['使用缓存', '已读取', '获取失败', '离线']);
  raw.data.failedBots = 1;
  assert.equal(sanitizeGroupStats(raw).partial, false);
  raw.partial = true;
  assert.equal(sanitizeGroupStats(raw).partial, true);
  const empty = payload();
  for (const key of Object.keys(empty.data)) if (typeof empty.data[key] === 'number') empty.data[key] = 0;
  empty.data.bots = [];
  assert.equal(sanitizeGroupStats(empty).data.uniqueGroups, 0);
});

test('malformed or missing counts never become a misleading zero', () => {
  for (const value of [null, {}, { code: 500, data: null }, { ...payload(), partial: 'false' }, { ...payload(), updatedAt: privateValue }]) {
    assert.throws(() => sanitizeGroupStats(value));
  }
  for (const value of [null, undefined, -1, 1.5, '12', Number.MAX_SAFE_INTEGER + 1]) {
    const raw = payload();
    raw.data.totalGroups = value;
    assert.throws(() => sanitizeGroupStats(raw));
  }
  for (const mutate of [
    raw => { raw.data.uniqueGroups = 13; },
    raw => { raw.data.duplicateGroups = 2; },
    raw => { raw.data.cachedBots = 1; },
    raw => { raw.data.bots[0].uniqueGroupCount = 8; },
    raw => { raw.data.bots[0].groupCount = null; },
  ]) {
    const raw = payload();
    mutate(raw);
    assert.throws(() => sanitizeGroupStats(raw));
  }
});

test('client reads the fixed stats endpoint without credentials, coalesces calls and refreshes after 30 seconds', async () => {
  let calls = 0;
  let clock = 100_000;
  const client = createEmoClient({ guobaBaseUrl: 'http://yunzai.example:2536/guoba', now: () => clock, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.href, 'http://yunzai.example:2536/api/emo/stats');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return json(payload());
  } });
  const snapshots = await Promise.all(Array.from({ length: 5 }, () => client.getStats()));
  assert.equal(calls, 1);
  assert.ok(snapshots.every(value => value.error === null && value.data.uniqueGroups === 9));
  assert.equal(snapshots[0].fetchedAt, new Date(clock).toISOString());
  assert.equal(snapshots[0].updatedAt, '2026-09-09T08:42:14.020Z');
  await client.getStats();
  assert.equal(calls, 1);
  clock += 30_001;
  await client.getStats();
  assert.equal(calls, 2);
});

test('configuration supports a separate host or proxy prefix, and explicit disabling', async () => {
  const fetchImpl = () => assert.fail('must not fetch');
  assert.equal((await createEmoClient({ fetchImpl }).getStats()).configured, false);
  assert.equal((await createEmoClient({ baseUrl: '', guobaBaseUrl: 'http://yunzai.example/guoba', fetchImpl }).getStats()).configured, false);
  for (const baseUrl of ['file:///secret', 'http://name:password@yunzai.example', 'http://yunzai.example?token=secret', 'http://yunzai.example/#secret', 'invalid']) {
    assert.ok((await createEmoClient({ baseUrl, fetchImpl }).getStats()).error);
  }
  const configured = createEmoClient({ baseUrl: 'https://stats.example/prefix', guobaBaseUrl: 'http://yunzai.example/guoba', fetchImpl: async url => {
    assert.equal(url.href, 'https://stats.example/prefix/api/emo/stats');
    return json(payload());
  } });
  assert.equal((await configured.getStats()).error, null);
});

test('upstream failures clear old data, hide error bodies, cool down and recover', async () => {
  let clock = 100_000;
  let fails = false;
  let calls = 0;
  const client = createEmoClient({ baseUrl: 'http://yunzai.example', now: () => clock, fetchImpl: async () => {
    calls++;
    if (fails) throw new Error(privateValue);
    return json(payload());
  } });
  assert.equal((await client.getStats()).data.uniqueGroups, 9);
  fails = true;
  clock += 30_001;
  const failure = await client.getStats();
  assert.equal(failure.data, null);
  assert.equal(failure.updatedAt, null);
  assert.equal(Date.parse(failure.retryAt), clock + 60_000);
  assert.ok(!JSON.stringify(failure).includes(privateValue));
  await client.getStats();
  assert.equal(calls, 2);
  fails = false;
  clock += 60_001;
  assert.equal((await client.getStats()).data.uniqueGroups, 9);
  assert.equal(calls, 3);
});

test('non-JSON, oversized, redirected and business-error responses fail safely', async () => {
  for (const response of [
    new Response(privateValue, { status: 500 }),
    new Response(null, { status: 302, headers: { Location: 'http://secret.test' } }),
    new Response(privateValue, { headers: { 'Content-Type': 'text/html' } }),
    new Response(privateValue, { headers: { 'Content-Type': 'application/json' } }),
    new Response(' '.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' } }),
    json({ code: 500, message: privateValue, data: null }),
  ]) {
    const result = await createEmoClient({ baseUrl: 'http://yunzai.example', fetchImpl: async () => response }).getStats();
    assert.ok(result.error);
    assert.equal(result.data, null);
    assert.ok(!JSON.stringify(result).includes(privateValue));
  }
});

test('public route works independently of account login and rejects query forwarding', async () => {
  let calls = 0;
  let fails = false;
  const app = createApp({ baseUrl: 'http://ai.example', emo: { baseUrl: 'http://yunzai.example', cacheMs: 0, fetchImpl: async () => {
    calls++;
    if (fails) throw new Error(privateValue);
    return json(payload());
  } } });
  const server = await listenForTest(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of ['group_id=123456789', 'url=http://secret.test', 'format=image']) {
      assert.equal((await fetch(`${base}/api/group-stats?${query}`)).status, 400);
    }
    assert.equal(calls, 0);
    const response = await fetch(`${base}/api/group-stats`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.json();
    assert.equal(body.data.uniqueGroups, 9);
    assert.ok(!JSON.stringify(body).includes(privateValue));
    assert.equal((await (await fetch(`${base}/api/accounts`)).json()).configured, false);
    fails = true;
    const failure = await fetch(`${base}/api/group-stats`);
    assert.equal(failure.status, 503);
    assert.ok(Number(failure.headers.get('retry-after')) > 0);
    assert.equal((await failure.json()).data, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
