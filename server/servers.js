const DEFAULT_BASE_URL = 'https://server.qqun.top';
const FRESHNESS_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const text = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = (value, max = Number.MAX_SAFE_INTEGER) => {
  const number = finite(value);
  return number !== null && number >= 0 && number <= max ? number : null;
};
const bounded = (value, min, max) => {
  const number = finite(value);
  return number !== null && number >= min && number <= max ? number : null;
};
const integer = (value, max = Number.MAX_SAFE_INTEGER) => {
  const number = nonnegative(value, max);
  return number === null ? null : Math.round(number);
};

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function timestampValue(value) {
  const parsed = timestamp(value);
  return parsed ? Date.parse(parsed) : null;
}

function percentage(used, total) {
  const value = nonnegative(used);
  const capacity = nonnegative(total);
  if (value === null || capacity === null || capacity <= 0) return null;
  return Math.min(100, Math.max(0, value / capacity * 100));
}

function tags(value) {
  if (typeof value !== 'string') return [];
  return value.split(/[;,]/).map(item => text(item, 40)).filter(Boolean).slice(0, 12);
}

function parseNode(node) {
  const id = text(node?.uuid, 120);
  const name = text(node?.name, 160);
  if (!id || !name) return null;
  return {
    id,
    name,
    region: text(node.region, 30),
    tags: tags(node.tags),
    os: text(node.os, 100),
    arch: text(node.arch, 30),
    cpuName: text(node.cpu_name, 140),
    cpuCores: integer(node.cpu_cores, 512),
  };
}

export function sanitizeServerNodes(payload) {
  if (payload?.status !== 'success' || !Array.isArray(payload.data)) throw new Error('INVALID_NODE_PAYLOAD');
  return payload.data
    .filter(node => node?.hidden !== true && text(node?.name) !== '乌鸦电脑')
    .map(parseNode)
    .filter(Boolean);
}

function recentMetric(row) {
  const time = timestamp(row?.updated_at ?? row?.time);
  if (!time) return null;
  const cpu = row?.cpu && typeof row.cpu === 'object' ? row.cpu : {};
  const ram = row?.ram && typeof row.ram === 'object' ? row.ram : {};
  const swap = row?.swap && typeof row.swap === 'object' ? row.swap : {};
  const disk = row?.disk && typeof row.disk === 'object' ? row.disk : {};
  const network = row?.network && typeof row.network === 'object' ? row.network : {};
  const connections = row?.connections && typeof row.connections === 'object' ? row.connections : {};
  return {
    timestamp: time,
    cpuPercent: bounded(cpu.usage, 0, 100),
    load1: nonnegative(row?.load?.load1, 1_000_000),
    load5: nonnegative(row?.load?.load5, 1_000_000),
    load15: nonnegative(row?.load?.load15, 1_000_000),
    memoryUsed: nonnegative(ram.used),
    memoryTotal: nonnegative(ram.total),
    diskUsed: nonnegative(disk.used),
    diskTotal: nonnegative(disk.total),
    swapUsed: nonnegative(swap.used),
    swapTotal: nonnegative(swap.total),
    uploadBps: nonnegative(network.up, 1e15),
    downloadBps: nonnegative(network.down, 1e15),
    totalUpload: nonnegative(network.totalUp, 1e18),
    totalDownload: nonnegative(network.totalDown, 1e18),
    tcpConnections: integer(connections.tcp, 1e7),
    udpConnections: integer(connections.udp, 1e7),
    processCount: integer(row?.process, 1e7),
    uptimeSeconds: nonnegative(row?.uptime, 1e10),
  };
}

function historyMetric(row) {
  const time = timestamp(row?.time ?? row?.updated_at);
  if (!time) return null;
  return {
    timestamp: time,
    cpuPercent: bounded(row?.cpu, 0, 100),
    load1: nonnegative(row?.load, 1_000_000),
    load5: null,
    load15: null,
    memoryUsed: nonnegative(row?.ram),
    memoryTotal: nonnegative(row?.ram_total),
    diskUsed: nonnegative(row?.disk),
    diskTotal: nonnegative(row?.disk_total),
    swapUsed: nonnegative(row?.swap),
    swapTotal: nonnegative(row?.swap_total),
    uploadBps: nonnegative(row?.net_out, 1e15),
    downloadBps: nonnegative(row?.net_in, 1e15),
    totalUpload: nonnegative(row?.net_total_up, 1e18),
    totalDownload: nonnegative(row?.net_total_down, 1e18),
    tcpConnections: integer(row?.connections, 1e7),
    udpConnections: integer(row?.connections_udp, 1e7),
    processCount: integer(row?.process, 1e7),
    uptimeSeconds: null,
  };
}

function sortMetrics(rows) {
  return rows.filter(Boolean).sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

export function sanitizeServerRecent(payload) {
  if (payload?.status !== 'success' || !Array.isArray(payload.data)) throw new Error('INVALID_RECENT_PAYLOAD');
  return sortMetrics(payload.data.map(recentMetric));
}

export function sanitizeServerHistory(payload) {
  const records = Array.isArray(payload?.data?.records) ? payload.data.records : payload?.records;
  if (!Array.isArray(records)) throw new Error('INVALID_HISTORY_PAYLOAD');
  return sortMetrics(records.map(historyMetric));
}

function mergeMetric(primary, fallback) {
  if (!primary && !fallback) return null;
  const result = { ...(fallback ?? {}), ...(primary ?? {}) };
  for (const key of Object.keys(result)) if (result[key] === null || result[key] === undefined) result[key] = fallback?.[key] ?? null;
  return result;
}

function historyPoints(rows, key) {
  return rows
    .slice()
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .map(row => {
      const value = key === 'memoryPercent' ? percentage(row.memoryUsed, row.memoryTotal)
        : key === 'diskPercent' ? percentage(row.diskUsed, row.diskTotal)
          : row.cpuPercent;
      return value === null ? null : { timestamp: row.timestamp, value };
    })
    .filter(Boolean);
}

function isFresh(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Math.max(0, Date.now() - parsed) <= FRESHNESS_MS;
}

function latestView(metric) {
  if (!metric) return null;
  return {
    cpuPercent: metric.cpuPercent,
    load1: metric.load1,
    load5: metric.load5,
    load15: metric.load15,
    memoryUsed: metric.memoryUsed,
    memoryTotal: metric.memoryTotal,
    diskUsed: metric.diskUsed,
    diskTotal: metric.diskTotal,
    swapUsed: metric.swapUsed,
    swapTotal: metric.swapTotal,
    uploadBps: metric.uploadBps,
    downloadBps: metric.downloadBps,
    totalUpload: metric.totalUpload,
    totalDownload: metric.totalDownload,
    tcpConnections: metric.tcpConnections,
    udpConnections: metric.udpConnections,
    processCount: metric.processCount,
    uptimeSeconds: metric.uptimeSeconds,
  };
}

function validateBaseUrl(value) {
  if (value === '') return null;
  const parsed = new URL(value || DEFAULT_BASE_URL);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SERVER_STATUS_BASE_URL must be an HTTP(S) URL without credentials or query parameters');
  }
  return parsed;
}

function createRequestUrl(base, path) {
  const prefix = base.pathname.replace(/\/$/, '');
  return new URL(`${prefix}${path}`, base.origin);
}

export function createServerStatusClient({ baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 10_000 } = {}) {
  const upstream = validateBaseUrl(baseUrl);
  let cache = null;
  let cacheTimestamp = 0;
  let inFlight = null;

  async function read(path) {
    const response = await fetchImpl(createRequestUrl(upstream, path), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('UPSTREAM_UNAVAILABLE');
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
    try { return JSON.parse(body); } catch { throw new Error('UPSTREAM_INVALID_JSON'); }
  }

  async function loadNode(node) {
    const [recent, history] = await Promise.allSettled([
      read(`/api/recent/${encodeURIComponent(node.id)}`),
      read(`/api/records/load?uuid=${encodeURIComponent(node.id)}&hours=1`),
    ]);
    const errors = [];
    let recentRows = [];
    let historyRows = [];
    if (recent.status === 'fulfilled') {
      try { recentRows = sanitizeServerRecent(recent.value); } catch { errors.push('实时快照暂时不可用。'); }
    } else errors.push('实时快照暂时不可用。');
    if (history.status === 'fulfilled') {
      try { historyRows = sanitizeServerHistory(history.value); } catch { errors.push('趋势数据暂时不可用。'); }
    } else errors.push('趋势数据暂时不可用。');
    const recentLatest = recentRows[0] ?? null;
    const historyLatest = historyRows[0] ?? null;
    const latest = mergeMetric(recentLatest, historyLatest);
    const lastSeen = latest?.timestamp ?? null;
    return {
      ...node,
      presence: lastSeen ? isFresh(lastSeen) ? 'online' : 'offline' : 'unavailable',
      lastSeen,
      latest: latestView(latest),
      history: {
        cpu: historyPoints(historyRows, 'cpuPercent'),
        memory: historyPoints(historyRows, 'memoryPercent'),
        disk: historyPoints(historyRows, 'diskPercent'),
      },
      error: errors.length > 0 ? errors.join(' ') : null,
    };
  }

  async function getStatus() {
    if (!upstream) return { configured: false, servers: [], fetchedAt: new Date().toISOString(), error: '服务器状态服务尚未配置。' };
    if (cache && Date.now() - cacheTimestamp < cacheMs) return cache;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const nodes = sanitizeServerNodes(await read('/api/nodes'));
      const servers = await Promise.all(nodes.map(loadNode));
      const snapshot = {
        configured: true,
        servers,
        fetchedAt: new Date().toISOString(),
        error: servers.some(server => server.error || server.presence === 'unavailable') ? '部分服务器数据暂时不可用。' : null,
      };
      cache = snapshot;
      cacheTimestamp = Date.now();
      return snapshot;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }

  return { getStatus, configured: !!upstream };
}

export const serverFreshnessMs = FRESHNESS_MS;
export const serverDefaultBaseUrl = DEFAULT_BASE_URL;
