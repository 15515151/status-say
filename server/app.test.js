import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listenForTest } from './test-helpers.js';
import { createApp } from './app.js';
import { sanitizeLogs, sanitizeMetrics } from './data.js';

const secret = 'sk-test-secret-not-for-the-browser';
const rawLogs = { success: true, data: [{
  id: 1, type: 2, created_at: 1788894969, model_name: 'xc', group: 'default',
  prompt_tokens: 33491, completion_tokens: 194, use_time: 17, is_stream: false,
  username: 'private-user', ip: '10.0.0.12', token_name: secret, token_id: 1,
  user_id: 4, quota: 12923, request_id: 'internal-request', content: `Bearer ${secret}`,
  other: JSON.stringify({ upstream_model_name: 'glm-5.3-flash', cache_tokens: 0, frt: -1000, internal_key: secret }),
}] };
const rawMetrics = { success: true, data: { model_name: 'xc', series_schema: 'internal', groups: [{
  group: 'default', avg_ttft_ms: 0, avg_latency_ms: 7439, success_rate: 100,
  avg_tps: 1.5682408817994442,
  series: [{ ts: 1788886800, avg_ttft_ms: 0, avg_latency_ms: 7439, success_rate: 100, avg_tps: 1.5682408817994442 }],
}] } };
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fixtureFetch = async url => json(url.pathname === '/api/log/token' ? rawLogs : rawMetrics);

async function withServer(config, callback) {
  const app = createApp({ baseUrl: 'http://upstream.example:5332', apiKey: secret, fetchImpl: fixtureFetch, ...config });
  const server = await listenForTest(app);
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('normalizes real log fields and strips private fields, raw content and invalid TTFT', () => {
  const logs = sanitizeLogs(rawLogs, secret);
  assert.equal(logs[0].durationSeconds, 17);
  assert.equal(logs[0].promptTokens, 33491);
  assert.equal(logs[0].upstreamModel, 'glm-5.3-flash');
  assert.equal(logs[0].firstTokenMs, null);
  const body = JSON.stringify(logs);
  for (const forbidden of [secret, 'private-user', '10.0.0.12', 'internal-request', 'quota', 'user_id', 'token_id']) assert.ok(!body.includes(forbidden), forbidden);
});

test('supports failed requests, malformed optional metadata, and excludes billing-only records', () => {
  const logs = sanitizeLogs({ success: true, data: [
    { id: 1, type: 1 }, { id: 2, type: 5, created_at: 100, other: 'broken' },
    { id: 3, type: 2, created_at: 200, other: 'null', use_time: -1 },
  ] });
  assert.deepEqual(logs.map(log => log.id), [3, 2]);
  assert.deepEqual(logs.map(log => log.status), ['success', 'error']);
  assert.equal(logs[0].durationSeconds, null);
});

test('does not invent metrics or interpret absent TTFT as zero latency', () => {
  const normalized = sanitizeMetrics(rawMetrics);
  assert.equal(normalized.groups[0].latencyMs, 7439);
  assert.equal(normalized.groups[0].successRate, 100);
  assert.equal(normalized.groups[0].ttftMs, null);
  assert.equal(normalized.groups[0].series.length, 1);
  assert.equal(sanitizeMetrics({ success: true, data: { groups: [{ series: [] }] } }).groups[0].successRate, null);
  assert.throws(() => sanitizeMetrics({ success: false, message: secret }));
});

test('browser endpoint attaches the key only upstream and returns safe fields', async () => {
  const paths = [];
  await withServer({ fetchImpl: async (url, options) => {
    assert.equal(url.origin, 'http://upstream.example:5332');
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.redirect, 'error');
    paths.push(url.pathname + url.search);
    return fixtureFetch(url);
  } }, async base => {
    const response = await fetch(`${base}/api/status?hours=24`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const body = await response.text();
    assert.ok(!body.includes(secret));
    assert.ok(!body.includes('upstream.example'));
    assert.equal(JSON.parse(body).logs.data.length, 1);
    assert.deepEqual(paths.sort(), ['/api/log/token', '/api/perf-metrics?model=xc&hours=24']);
  });
});

test('rejects unsupported ranges and cannot proxy user-provided URLs', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async () => { calls++; return json(rawLogs); } }, async base => {
    assert.equal((await fetch(`${base}/api/status?hours=http://evil.example`)).status, 400);
    assert.equal((await fetch(`${base}/api/proxy?url=http://evil.example`)).status, 404);
    assert.equal(calls, 0);
  });
});

test('shows partial outages while retaining the source that succeeded', async () => {
  await withServer({ fetchImpl: async url => url.pathname === '/api/log/token' ? new Response(secret, { status: 401 }) : json(rawMetrics) }, async base => {
    const response = await fetch(`${base}/api/status`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.logs.data, null);
    assert.ok(body.logs.error);
    assert.equal(body.metrics.data.groups[0].successRate, 100);
    assert.ok(!JSON.stringify(body).includes(secret));
  });
});

test('upstream errors cannot expose credentials in browser errors', async () => {
  await withServer({ fetchImpl: async () => { throw new Error(`connection failed Authorization: Bearer ${secret}`); } }, async base => {
    const response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(secret));
  });
});

test('missing configuration fails safely without contacting upstream', async () => {
  await withServer({ apiKey: undefined, fetchImpl: () => { throw new Error('must not fetch'); } }, async base => {
    assert.equal((await fetch(`${base}/api/status`)).status, 503);
  });
});

test('container healthcheck succeeds without credentials or contacting monitored services', async () => {
  let calls = 0;
  const unavailable = async () => { calls++; throw new Error('upstream unavailable'); };
  await withServer({ apiKey: undefined, fetchImpl: unavailable, guoba: { baseUrl: 'http://guoba.example', account: 'configured', password: 'configured', fetchImpl: unavailable } }, async base => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const checker = spawn(process.execPath, [fileURLToPath(new URL('./healthcheck.js', import.meta.url))], {
      env: { ...process.env, PORT: new URL(base).port }, stdio: 'ignore', windowsHide: true,
    });
    const exitCode = await new Promise((resolve, reject) => { checker.on('error', reject); checker.on('exit', resolve); });
    assert.equal(exitCode, 0);
    assert.equal(calls, 0);
  });
});

test('cache and concurrent request coalescing limit upstream polling', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async url => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return fixtureFetch(url); } }, async base => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/api/status?hours=24`)));
    await Promise.all(responses.map(response => response.arrayBuffer()));
    await (await fetch(`${base}/api/status?hours=24`)).arrayBuffer();
    assert.equal(calls, 2);
  });
});

test('redacts an accidentally echoed credential in allowed text fields', () => {
  const logs = sanitizeLogs({ success: true, data: [{ type: 2, model_name: secret, other: JSON.stringify({ upstream_model_name: secret }) }] }, secret);
  const metrics = sanitizeMetrics({ success: true, data: { model_name: secret, groups: [{ group: secret }] } }, secret);
  assert.ok(!JSON.stringify({ logs, metrics }).includes(secret));
});

test('private environment and server files are never served', async () => {
  await withServer({}, async base => {
    for (const path of ['/.env', '/server/index.js', '/server/app.js', '/package.json']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
  });
});
