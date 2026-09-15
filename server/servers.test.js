import test from 'node:test';
import assert from 'node:assert/strict';
import { listenForTest } from './test-helpers.js';
import { createApp } from './app.js';
import { sanitizeServerHistory, sanitizeServerNodes, sanitizeServerRecent } from './servers.js';

const now = () => Date.now();
const iso = milliseconds => new Date(milliseconds).toISOString();
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const nodes = [
  { uuid: 'node-us-sjc', name: '美国圣何塞', region: '🇺🇸', tags: 'RN', os: 'Ubuntu 24.04.4 LTS', arch: 'amd64', cpu_name: 'Xeon', cpu_cores: 5, hidden: false, price: 44.98 },
  { uuid: 'node-us-lax', name: '美国洛杉矶', region: '🇺🇸', tags: 'DMIT;LAX', os: 'Debian 12', arch: 'amd64', cpu_name: 'EPYC', cpu_cores: 1, hidden: false },
  { uuid: 'node-home', name: '家里云', region: '🇨🇳', tags: '', os: 'Ubuntu 24.04.4 LTS', arch: 'amd64', cpu_name: 'Xeon', cpu_cores: 20, hidden: false },
  { uuid: 'node-crow', name: '乌鸦电脑', region: '🇨🇳', hidden: false },
  { uuid: 'node-hidden', name: '隐藏节点', region: '🇨🇳', hidden: true },
];

function recentRow(id, age = 30_000) {
  return {
    uuid: id,
    updated_at: iso(now() - age),
    cpu: { usage: 12.5 },
    ram: { total: 1_000_000_000, used: 400_000_000 },
    swap: { total: 500_000_000, used: 50_000_000 },
    load: { load1: 0.5, load5: 0.4, load15: 0.3 },
    disk: { total: 10_000_000_000, used: 2_500_000_000 },
    network: { up: 2_000, down: 4_000, totalUp: 80_000, totalDown: 120_000 },
    connections: { tcp: 12, udp: 3 },
    uptime: 123_456,
    process: 98,
    secret: 'must-not-escape',
  };
}

function historyRow(age = 30_000) {
  return {
    time: iso(now() - age),
    cpu: 18,
    ram: 500_000_000,
    ram_total: 1_000_000_000,
    disk: 3_000_000_000,
    disk_total: 10_000_000_000,
    net_in: 3_000,
    net_out: 1_000,
    net_total_up: 70_000,
    net_total_down: 100_000,
    process: 90,
    connections: 10,
    connections_udp: 2,
    secret: 'must-not-escape',
  };
}

async function withServer(fetchImpl, callback, options = {}) {
  const app = createApp({
    baseUrl: 'http://ai.example',
    apiKey: '',
    servers: { baseUrl: 'http://komari.example', fetchImpl, cacheMs: options.cacheMs ?? 10_000 },
  });
  const server = await listenForTest(app);
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('sanitizes nodes, recent snapshots, and history into safe fields', () => {
  const selected = sanitizeServerNodes({ status: 'success', data: nodes });
  assert.deepEqual(selected.map(node => node.name), ['美国圣何塞', '美国洛杉矶', '家里云']);
  assert.equal(selected[0].cpuCores, 5);
  assert.ok(!JSON.stringify(selected).includes('44.98'));

  const recent = sanitizeServerRecent({ status: 'success', data: [recentRow('node-us-sjc')] });
  assert.equal(recent[0].cpuPercent, 12.5);
  assert.equal(recent[0].uploadBps, 2_000);
  assert.equal(recent[0].downloadBps, 4_000);
  assert.equal(recent[0].uptimeSeconds, 123_456);
  assert.ok(!JSON.stringify(recent).includes('must-not-escape'));

  const history = sanitizeServerHistory({ status: 'success', data: { records: [historyRow()] } });
  assert.equal(history[0].memoryUsed, 500_000_000);
  assert.equal(history[0].diskUsed, 3_000_000_000);
  assert.equal(history[0].downloadBps, 3_000);
  assert.ok(!JSON.stringify(history).includes('must-not-escape'));
});

test('returns three visible nodes with one-hour percentage trends and current details', async () => {
  await withServer(async (url, options) => {
    assert.equal(url.origin, 'http://komari.example');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname === '/api/nodes') return json({ status: 'success', data: nodes });
    if (url.pathname.startsWith('/api/recent/')) return json({ status: 'success', data: [recentRow(url.pathname.split('/').pop())] });
    if (url.pathname === '/api/records/load') return json({ records: [historyRow(60 * 60 * 1000), historyRow()] });
    return new Response(null, { status: 404 });
  }, async base => {
    const response = await fetch(`${base}/api/servers`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.servers.length, 3);
    assert.deepEqual(body.servers.map(server => server.name), ['美国圣何塞', '美国洛杉矶', '家里云']);
    assert.equal(body.servers[0].presence, 'online');
    assert.equal(body.servers[0].latest.memoryUsed, 400_000_000);
    assert.equal(body.servers[0].latest.uploadBps, 2_000);
    assert.equal(body.servers[0].history.memory[0].value, 50);
    assert.equal(body.servers[0].history.disk[0].value, 30);
    assert.ok(!JSON.stringify(body).includes('komari.example'));
    assert.ok(!JSON.stringify(body).includes('must-not-escape'));
  });
});

test('distinguishes stale and unavailable nodes without fabricating metrics', async () => {
  await withServer(async url => {
    if (url.pathname === '/api/nodes') return json({ status: 'success', data: nodes.slice(0, 3) });
    const id = url.pathname.split('/').pop();
    if (url.pathname.startsWith('/api/recent/')) {
      if (id === 'node-us-sjc') return json({ status: 'success', data: [recentRow(id, 6 * 60 * 1000)] });
      if (id === 'node-us-lax') return json({ status: 'success', data: [] });
      return json({ status: 'success', data: [recentRow(id)] });
    }
    if (url.pathname === '/api/records/load') {
      if (url.searchParams.get('uuid') === 'node-us-lax') return json({ records: [] });
      return json({ records: [historyRow(6 * 60 * 1000)] });
    }
    return new Response(null, { status: 404 });
  }, async base => {
    const body = await (await fetch(`${base}/api/servers`)).json();
    assert.equal(body.servers[0].presence, 'offline');
    assert.equal(body.servers[1].presence, 'unavailable');
    assert.equal(body.servers[1].latest, null);
    assert.equal(body.servers[2].presence, 'online');
    assert.ok(body.error);
  });
});

test('keeps partial node failures visible and returns a safe 502 when node list fails', async () => {
  await withServer(async url => {
    if (url.pathname === '/api/nodes') return json({ status: 'success', data: nodes.slice(0, 3) });
    if (url.pathname.includes('node-us-sjc') || url.searchParams.get('uuid') === 'node-us-sjc') return new Response('private upstream failure', { status: 500 });
    if (url.pathname.startsWith('/api/recent/')) return json({ status: 'success', data: [recentRow('node')] });
    if (url.pathname === '/api/records/load') return json({ records: [historyRow()] });
    return new Response(null, { status: 404 });
  }, async base => {
    const response = await fetch(`${base}/api/servers`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.servers.length, 3);
    assert.equal(body.servers[0].presence, 'unavailable');
    assert.ok(body.servers[0].error);
    assert.ok(!JSON.stringify(body).includes('private upstream failure'));
  });

  await withServer(async () => new Response('private node list failure', { status: 503 }), async base => {
    const response = await fetch(`${base}/api/servers`);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.deepEqual(body.servers, []);
    assert.equal(typeof body.fetchedAt, 'string');
    assert.equal(body.error, '服务器列表暂时无法获取。');
  });
});

test('rejects query forwarding, supports disabling, and coalesces cached requests', async () => {
  let calls = 0;
  await withServer(async url => {
    calls++;
    if (url.pathname === '/api/nodes') return json({ status: 'success', data: nodes.slice(0, 3) });
    if (url.pathname.startsWith('/api/recent/')) return json({ status: 'success', data: [recentRow('node')] });
    if (url.pathname === '/api/records/load') return json({ records: [historyRow()] });
    return new Response(null, { status: 404 });
  }, async base => {
    assert.equal((await fetch(`${base}/api/servers?url=https://evil.example`)).status, 400);
    const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/api/servers`)));
    await Promise.all(responses.map(response => response.arrayBuffer()));
    assert.equal(calls, 7);
    await (await fetch(`${base}/api/servers`)).arrayBuffer();
    assert.equal(calls, 7);
  });

  const app = createApp({ baseUrl: 'http://ai.example', servers: { baseUrl: '' } });
  const server = await listenForTest(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/servers`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, '服务器状态服务尚未配置。');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
