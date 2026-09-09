// Values from rconsole-plugin/constants/resolve.js; no upstream free-form labels.
const PLATFORMS = new Set(['哔哩哔哩', '抖音', 'TikTok', 'Twitter', 'Instagram', 'Acfun', '小红书', '波点', '通用（包含快手等）', 'YouTube', '米游社', '网易云音乐', '微博', '微视', '最右', 'AM+Spotify', '扣扣音乐', '酷狗音乐', '汽水音乐', '小飞机', '贴吧', '小黑盒', '视频号', 'AI总结']);
const MAX_BODY_BYTES = 1024 * 1024;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const seconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const duration = value => typeof value === 'string' && /^(?:\d{1,10}小时\d{1,2}分|\d{1,10}分\d{1,2}秒|\d{1,10}(?:\.\d{1,2})?秒)$/.test(value) ? value : null;
const bytes = value => typeof value === 'string' && /^\d{1,15}(?:\.\d{1,2})? (?:B|KB|MB|GB)$/.test(value) ? value : null;

function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`2000-${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(5, 10) === value ? value : null;
}

export function sanitizeParseStats(payload) {
  const source = payload?.data;
  if (payload?.code !== 0 || source?.mode !== 'global' || count(source.totalParses) === null
    || !Array.isArray(source.platformRows) || !Array.isArray(source.historyRows)
    || source.platformRows.length > 100 || source.historyRows.length > 366) {
    throw new Error('INVALID_RCONSOLE_PAYLOAD');
  }

  // Platform names are the only upstream names we publish. Unknown labels merge into a fixed bucket.
  const platforms = new Map();
  for (const row of source.platformRows) {
    const total = count(row?.count);
    if (total === null) throw new Error('INVALID_RCONSOLE_COUNT');
    const name = PLATFORMS.has(row.name) ? row.name : '其他';
    const combined = (platforms.get(name) ?? 0) + total;
    if (!Number.isSafeInteger(combined)) throw new Error('INVALID_RCONSOLE_COUNT');
    platforms.set(name, combined);
  }
  const history = source.historyRows.slice(-30).map(row => {
    const date = dateLabel(row?.date);
    if (!date) throw new Error('INVALID_RCONSOLE_DATE');
    return { date, count: count(row.total), mediaSeconds: seconds(row.mediaSec) };
  });
  const media = source.media ?? {};
  const successCount = count(media.successCount);
  const failureCount = count(media.failureCount);
  const attempts = successCount === null || failureCount === null ? null : successCount + failureCount;

  // Build a new object at every level. IDs, names, avatars, ranks, paths and renderer fields never leave the server.
  return {
    totalParses: source.totalParses,
    totalUsers: count(source.totalUsers),
    platforms: [...platforms].map(([name, total]) => ({ name, count: total })).sort((a, b) => b.count - a.count),
    history,
    media: {
      successCount, failureCount,
      successRate: attempts && Number.isSafeInteger(attempts) ? successCount / attempts * 100 : null,
      videoDuration: duration(media.videoDurationText),
      audioDuration: duration(media.audioDurationText),
      totalDuration: duration(media.totalMediaDurationText),
      averageDuration: duration(media.avgMediaText),
      maximumDuration: duration(media.maxMediaText),
      averageProcessTime: duration(media.avgProcessText),
      maximumProcessTime: duration(media.maxProcessText),
      totalBytes: bytes(media.totalBytesText),
      averageBytes: bytes(media.avgBytesText),
      durationSamples: count(media.durationSamples),
      sizeSamples: count(media.sizeSamples),
    },
  };
}

function validRoot(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

async function readJson(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('RCONSOLE_UNAVAILABLE');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('RCONSOLE_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createRconsoleClient({ baseUrl, guobaBaseUrl = '', fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 30_000, retryMs = 60_000, now = Date.now } = {}) {
  const configuredUrl = baseUrl ?? validRoot(guobaBaseUrl)?.origin ?? '';
  const configured = Boolean(configuredUrl);
  const root = validRoot(configuredUrl);
  if (root) root.pathname = `${root.pathname.replace(/\/+$/, '')}/`;
  let cached;
  let cacheUntil = 0;
  let inFlight;

  return {
    async getStats() {
      if (!configured) return { configured: false, data: null, fetchedAt: null, error: null, retryAt: null };
      if (cached && now() < cacheUntil) return cached;
      if (inFlight) return inFlight;
      inFlight = (async () => {
        try {
          if (!root) throw new Error('RCONSOLE_CONFIGURATION');
          const response = await fetchImpl(new URL('rconsole/api/parse-stats/global', root), {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
          });
          const data = sanitizeParseStats(await readJson(response));
          cached = { configured: true, data, fetchedAt: new Date(now()).toISOString(), error: null, retryAt: null };
          cacheUntil = now() + cacheMs;
        } catch {
          cacheUntil = now() + retryMs;
          cached = { configured: true, data: null, fetchedAt: null, error: root ? '解析统计暂时不可用，请稍后重试。' : '解析统计连接配置有误，请联系管理员。', retryAt: new Date(cacheUntil).toISOString() };
        }
        return cached;
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
}
