import test from 'node:test';
import assert from 'node:assert/strict';
import { createRconsoleClient, sanitizeParseStats, sanitizeGroupParseStats, maskGroupId, normalizeGroupId } from './rconsole.js';
import { createApp } from './app.js';
import { listenForTest } from './test-helpers.js';

const privateValue = 'private-name-123456789';
// 全局载荷按真实响应结构构造（含 topGroups / platformMediaRank / mediaTrendText 等字段）。
const payload = () => ({ code: 0, message: 'ok', data: {
  mode: 'global', dark: true, totalParses: 100, totalUsers: 7, totalGroups: 3,
  // 群名与头像属于必须丢弃的敏感字段。
  topGroups: [
    { rank: 1, groupId: '1103526495', name: privateValue, groupAvatar: 'https://p.qlogo.cn/gh/1103526495/1103526495/100', count: 393, users: 49 },
    { rank: 2, groupId: '1022651260', name: '浮世の带派七圣小屋', groupAvatar: 'https://p.qlogo.cn/gh/1022651260/1022651260/100', count: 368, users: 33 },
    { rank: 3, groupId: '123', name: privateValue, count: 10, users: 1 },
  ],
  topUsers: [{ userId: '987654321', name: privateValue }], tplFile: 'G:/Yunzai/private-file',
  platformRows: [{ name: '哔哩哔哩', count: 90, avatar: privateValue }, { name: privateValue, count: 6 }, { name: 'https://secret.test', count: 4 }],
  platformMediaRank: [
    { name: '哔哩哔哩', color: '#0984e3', videoText: '207小时33分', audioText: '0秒', totalText: '207小时33分', barPercent: 100 },
    { name: '网易云音乐', color: '#fdcb6e', videoText: '0秒', audioText: '1小时3分', totalText: '1小时3分', barPercent: 6 },
    { name: privateValue, videoText: '1秒', audioText: '0秒', totalText: '1秒' },
  ],
  platformDonut: { gradient: privateValue },
  historyRows: [{ date: '09-09', total: 10, mediaSec: 120, userId: privateValue, platforms: { [privateValue]: 10 } }],
  hasHistory: true, hasMediaRank: true, mediaTrendText: '224小时31分',
  media: { successCount: 98, failureCount: 2, successRate: 100,
    videoDurationText: '2小时10分', audioDurationText: '3分12秒', totalMediaDurationText: '2小时13分',
    avgMediaText: '1分23秒', maxMediaText: '30分0秒', avgProcessText: '40.9秒', maxProcessText: '2分12秒',
    totalBytesText: '1.23 GB', avgBytesText: '10.5 MB', durationSamples: 90, sizeSamples: 80, token: privateValue },
} });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

// 按群查询的上游载荷，字段名与真实响应一致（groupTotal / uniqueUsers / topUsers 等）。
const groupId = '1025919424';
const groupPayload = () => ({ code: 0, message: 'ok', data: {
  mode: 'group', dark: true, groupId: groupId, groupName: privateValue,
  groupAvatar: 'https://p.qlogo.cn/gh/1025919424/1025919424/100',
  groupTotal: 131, uniqueUsers: 12, groupRank: 8, globalTotal: 3289, globalGroups: 92,
  platformRows: [{ name: '抖音', count: 78, barPercent: 100 }, { name: '哔哩哔哩', count: 38, barPercent: 49 }, { name: privateValue, count: 15 }],
  platformDonut: { hasData: true, total: 131, gradient: privateValue, slices: [{ name: '抖音', count: 78, percent: '59.5', color: '#0984e3' }] },
  // 上游会返回真实 QQ 号、昵称与头像，这些必须全部丢弃。
  topUsers: [{ rank: 1, userId: '2995096985', name: privateValue, avatar: 'https://q1.qlogo.cn/g?b=qq&s=100&nk=2995096985', count: 63 }],
  media: { successCount: 122, failureCount: 2, successRate: 98, videoDurationText: '6小时35分', audioDurationText: '33分11秒',
    totalMediaDurationText: '7小时9分', avgMediaText: '4分56秒', maxMediaText: '4小时24分',
    avgProcessText: '28.9秒', maxProcessText: '4分48秒', totalBytesText: '2.34 GB', avgBytesText: '27.5 MB',
    durationSamples: 87, sizeSamples: 87, token: privateValue },
} });

test('一个群的统计只输出聚合值，群号一律掩码，群名、头像、成员与用户排行都不外泄', () => {
  const result = sanitizeGroupParseStats(groupPayload(), groupId);
  assert.deepEqual(Object.keys(result), ['groupId', 'totalParses', 'totalUsers', 'groupRank', 'globalTotal', 'globalGroups', 'platforms', 'media']);
  assert.equal(result.groupId, '10****24');
  // 累计解析取上游的 groupTotal，参与用户取 uniqueUsers。
  assert.equal(result.totalParses, 131);
  assert.equal(result.totalUsers, 12);
  assert.equal(result.groupRank, 8);
  assert.equal(result.globalTotal, 3289);
  assert.equal(result.globalGroups, 92);
  assert.deepEqual(result.platforms, [{ name: '抖音', count: 78 }, { name: '哔哩哔哩', count: 38 }, { name: '其他', count: 15 }]);
  assert.equal(result.media.successRate, 122 / 124 * 100);
  const body = JSON.stringify(result);
  for (const forbidden of [privateValue, groupId, '2995096985', 'qlogo.cn', 'https:', 'groupName', 'groupAvatar', 'topUsers', 'platformDonut', 'barPercent', 'slices', 'dark', 'token']) {
    assert.ok(!body.includes(forbidden), forbidden);
  }
});

test('群号掩码与校验拒绝异常输入，短号或非数字不会回显任何原文', () => {
  assert.equal(maskGroupId('123456789'), '12****89');
  assert.equal(maskGroupId('1234567'), '12****67');
  assert.equal(maskGroupId('123456'), null);
  assert.equal(maskGroupId(privateValue), null);
  assert.equal(maskGroupId(null), null);
  assert.equal(normalizeGroupId('123456789'), '123456789');
  assert.equal(normalizeGroupId(' 12345 '), '12345');
  for (const value of ['abc', '1234', '123456789012345678901', '', null, '123456789?x=1', '-123456']) assert.equal(normalizeGroupId(value), null);
  // 群号无效或 mode 不是 group 时直接抛错，不会退化成看似正常的空统计。
  assert.throws(() => sanitizeGroupParseStats(groupPayload(), '123'));
  assert.throws(() => sanitizeGroupParseStats({ ...groupPayload(), data: { ...groupPayload().data, mode: 'global' } }, groupId));
  assert.throws(() => sanitizeGroupParseStats({ ...groupPayload(), code: 1 }, groupId));
  assert.throws(() => sanitizeGroupParseStats({ code: 0, data: null }, groupId));
});

test('群统计对自由文本与越界计数同样只接受白名单值', () => {
  // 自由文本一旦不符合限定格式就降级为 null，而不是原样透传。
  const freeText = groupPayload();
  freeText.data.media.avgProcessText = privateValue;
  freeText.data.media.videoDurationText = '1秒\nCookie=private';
  freeText.data.uniqueUsers = privateValue;
  const degraded = sanitizeGroupParseStats(freeText, groupId);
  assert.equal(degraded.media.averageProcessTime, null);
  assert.equal(degraded.media.videoDuration, null);
  assert.equal(degraded.totalUsers, null);

  // 结构性字段非法时直接抛错，不会退化成看似正常的统计。
  const badCount = groupPayload();
  badCount.data.platformRows[0].count = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => sanitizeGroupParseStats(badCount, groupId));
  const noTotal = groupPayload();
  delete noTotal.data.groupTotal;
  assert.throws(() => sanitizeGroupParseStats(noTotal, groupId));
  const tooMany = groupPayload();
  tooMany.data.platformRows = Array.from({ length: 101 }, () => ({ name: '抖音', count: 1 }));
  assert.throws(() => sanitizeGroupParseStats(tooMany, groupId));
});

test('按群查询请求固定路径与参数，逐群缓存并合并并发，不携带任何凭据', async () => {
  let calls = 0;
  let clock = 100_000;
  const seen = [];
  const client = createRconsoleClient({ baseUrl: 'http://yunzai.example', now: () => clock, fetchImpl: async (url, options) => {
    calls++;
    seen.push(url.href);
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.equal(options.redirect, 'error');
    return json(groupPayload());
  } });
  const results = await Promise.all([client.getGroupStats(groupId), client.getGroupStats(groupId)]);
  assert.equal(calls, 1);
  assert.ok(results.every(value => value.exists && value.data.groupId === '10****24'));
  assert.equal(seen[0], 'http://yunzai.example/rconsole/api/parse-stats/group?group_id=1025919424');
  await client.getGroupStats(groupId);
  assert.equal(calls, 1);
  // 另一个群独立请求，不受上一个群的缓存影响。
  await client.getGroupStats('987654321');
  assert.equal(calls, 2);
  clock += 30_001;
  await client.getGroupStats(groupId);
  assert.equal(calls, 3);
});

test('群号非法时直接拒绝且不发起上游请求，查无此群按空结果返回', async () => {
  const unused = createRconsoleClient({ baseUrl: 'http://yunzai.example', fetchImpl: () => assert.fail('must not fetch') });
  for (const value of ['abc', '123', '', null]) {
    const result = await unused.getGroupStats(value);
    assert.equal(result.exists, false);
    assert.ok(result.error);
  }
  const missing = createRconsoleClient({ baseUrl: 'http://yunzai.example', fetchImpl: async () => json({ code: 0, data: null }) });
  const empty = await missing.getGroupStats(groupId);
  assert.equal(empty.exists, false);
  assert.equal(empty.data, null);
  assert.equal(empty.error, null);
});

test('按群查询的上游故障只返回脱敏错误并退避重试', async () => {
  let clock = 100_000;
  let calls = 0;
  const client = createRconsoleClient({ baseUrl: 'http://yunzai.example', now: () => clock, fetchImpl: async () => { calls++; throw new Error(privateValue); } });
  const failure = await client.getGroupStats(groupId);
  assert.equal(failure.data, null);
  assert.equal(failure.exists, false);
  assert.equal(Date.parse(failure.retryAt), 160_000);
  assert.ok(!JSON.stringify(failure).includes(privateValue));
  clock += 1_000;
  await client.getGroupStats(groupId);
  assert.equal(calls, 1);
});

test('按群统计路由只接受 group_id，其余参数一律拒绝', async () => {
  const calls = [];
  const app = createApp({ baseUrl: 'http://ai.example', rconsole: { baseUrl: 'http://yunzai.example', fetchImpl: async url => { calls.push(url.href); return json(groupPayload()); } } });
  const server = await listenForTest(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/api/parse-stats/group', '/api/parse-stats/group?group_id=abc', '/api/parse-stats/group?group_id=123', '/api/parse-stats/group?group_id=1025919424&format=image', '/api/parse-stats/group?name=private-name-123456789']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 400, path);
      assert.ok(!JSON.stringify(await response.json()).includes(privateValue));
    }
    assert.equal(calls.length, 0);
    const response = await fetch(base + '/api/parse-stats/group?group_id=' + groupId);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.data.groupId, '10****24');
    assert.equal(body.data.totalParses, 131);
    assert.equal(body.error, null);
    const text = JSON.stringify(body);
    assert.ok(!text.includes(privateValue));
    assert.ok(!text.includes(groupId));
    for (const forbidden of ['2995096985', 'qlogo.cn', 'topUsers', 'platformDonut']) assert.ok(!text.includes(forbidden), forbidden);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('群头像代理只按不透明 ID 取图，未注册的 ID 返回 404 且不发起上游请求', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  let avatarCalls = 0;
  const app = createApp({
    baseUrl: 'http://ai.example',
    rconsole: { baseUrl: 'http://yunzai.example', fetchImpl: async () => json(payload()) },
    avatars: { fetchImpl: async url => {
      avatarCalls++;
      assert.equal(url.hostname, 'p.qlogo.cn');
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    } },
  });
  const server = await listenForTest(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // 未注册的 ID：直接 404，不访问上游。
    assert.equal((await fetch(`${base}/api/parse-stats/group-avatar/${'0'.repeat(24)}`)).status, 404);
    // 非 24 位十六进制的 ID 同样拒绝。
    assert.equal((await fetch(`${base}/api/parse-stats/group-avatar/1103526495`)).status, 404);
    assert.equal(avatarCalls, 0);

    // 先取一次统计，让服务端注册群头像来源。
    const stats = await (await fetch(`${base}/api/parse-stats`)).json();
    const path = stats.data.topGroups[0].avatarPath;
    assert.match(path, /^\/api\/parse-stats\/group-avatar\/[a-f0-9]{24}$/);
    const image = await fetch(base + path);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(avatarCalls, 1);
    // 响应里不能出现真实群号或上游头像主机。
    assert.ok(!JSON.stringify(stats).includes('1103526495'));
    assert.ok(!JSON.stringify(stats).includes('qlogo.cn'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('statistics response contains only anonymous aggregate fields at every level', () => {
  const result = sanitizeParseStats(payload());
  assert.deepEqual(Object.keys(result), ['totalParses', 'totalUsers', 'totalGroups', 'platforms', 'history', 'hasHistory', 'topGroups', 'platformMedia', 'mediaTrendSeconds', 'media']);
  assert.deepEqual(result.platforms, [{ name: '哔哩哔哩', count: 90 }, { name: '其他', count: 10 }]);
  assert.deepEqual(result.history, [{ date: '09-09', count: 10, mediaSeconds: 120 }]);
  assert.equal(result.media.successRate, 98);
  assert.equal(result.media.totalDuration, '2小时13分');
  assert.equal(result.hasHistory, true);
  assert.equal(result.mediaTrendSeconds, 224 * 3600 + 31 * 60);
  const body = JSON.stringify(result);
  for (const forbidden of [privateValue, '987654321', 'qlogo.cn', 'example.com', 'https:', 'G:/', 'topUsers', 'gradient', 'token', '浮世の带派七圣小屋', 'groupAvatar']) assert.ok(!body.includes(forbidden), forbidden);
});

test('群排行只保留脱敏群号与聚合计数，群名一律丢弃，头像走不透明 ID', () => {
  const registered = new Map();
  const secret = Buffer.alloc(32, 7);
  const result = sanitizeParseStats(payload(), { groupIdSecret: secret, registerGroupAvatar: (id, source) => registered.set(id, source) });
  // 群号脱敏为 11****95 / 10****60 形式；第三条群号 '123' 位数不足，整项剔除。
  assert.deepEqual(result.topGroups.map(({ avatarPath, ...rest }) => rest), [
    { groupId: '11****95', count: 393, users: 49 },
    { groupId: '10****60', count: 368, users: 33 },
  ]);
  // 头像路径是不透明 ID，真实群号与上游 qlogo 地址都不出现在响应里。
  for (const row of result.topGroups) {
    assert.match(row.avatarPath, /^\/api\/parse-stats\/group-avatar\/[a-f0-9]{24}$/);
    const body = JSON.stringify(row);
    for (const forbidden of ['1103526495', '1022651260', 'qlogo.cn', privateValue]) assert.ok(!body.includes(forbidden), forbidden);
  }
  assert.deepEqual(Object.keys(result.topGroups[0]), ['groupId', 'count', 'users', 'avatarPath']);
  // 注册表里存的是真实群头像地址，且只按不透明 ID 索引。
  assert.equal(registered.size, 2);
  for (const [id, source] of registered) {
    assert.match(id, /^[a-f0-9]{24}$/);
    assert.match(source, /^https:\/\/p\.qlogo\.cn\/gh\/\d+\/\d+\/100$/);
  }
});

test('群头像地址只接受 GH 群头像，其它 qlogo 资源与畸形地址一律拒绝', () => {
  const secret = Buffer.alloc(32, 7);
  const withAvatar = url => {
    const raw = payload();
    raw.data.topGroups = [{ groupId: '1103526495', name: privateValue, groupAvatar: url, count: 1, users: 1 }];
    return sanitizeParseStats(raw, { groupIdSecret: secret }).topGroups[0]?.avatarPath ?? null;
  };
  assert.ok(withAvatar('https://p.qlogo.cn/gh/1103526495/1103526495/100'));
  for (const bad of [
    'http://p.qlogo.cn/gh/1103526495/1103526495/100',
    'https://p.qlogo.cn/g?b=qq&nk=1103526495&s=100',
    'https://evil.test/gh/1103526495/1103526495/100',
    'https://p.qlogo.cn/gh/1103526495/1103526495/100?x=1',
    'https://user:pass@p.qlogo.cn/gh/1103526495/1103526495/100',
    'https://p.qlogo.cn/gh/abc/def/100',
    privateValue,
    null,
  ]) assert.equal(withAvatar(bad), null, String(bad));
});

test('平台媒体时长排行按秒排序，未知平台并入其他，自由文本不会混入', () => {
  const result = sanitizeParseStats(payload());
  assert.deepEqual(result.platformMedia, [
    { name: '哔哩哔哩', videoSeconds: 207 * 3600 + 33 * 60, audioSeconds: 0, totalSeconds: 207 * 3600 + 33 * 60 },
    { name: '网易云音乐', videoSeconds: 0, audioSeconds: 3780, totalSeconds: 3780 },
    { name: '其他', videoSeconds: 1, audioSeconds: 0, totalSeconds: 1 },
  ]);
  const bad = payload();
  bad.data.platformMediaRank[0].totalText = privateValue;
  bad.data.platformMediaRank[1].totalText = '1小时\nCookie=private';
  // 前两条无法解析被跳过，只剩第三条未知平台（1 秒）并入「其他」，原文不会带出去。
  assert.deepEqual(sanitizeParseStats(bad).platformMedia, [{ name: '其他', videoSeconds: 1, audioSeconds: 0, totalSeconds: 1 }]);
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
