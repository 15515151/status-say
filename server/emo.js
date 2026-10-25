const MAX_BODY_BYTES = 1024 * 1024;
const COUNT_FIELDS = ['oneBotCount', 'icqqCount', 'skippedBots', 'loadedBots', 'failedBots', 'cachedBots', 'offlineBots', 'totalGroups', 'uniqueGroups', 'duplicateGroups'];
const BOT_TYPES = new Set(['OneBot', 'ICQQ']);
const BOT_STATUSES = new Set(['已读取', '离线', '获取失败', '使用缓存']);

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_EMO_COUNT');
  return value;
}

export function sanitizeGroupStats(payload) {
  const source = payload?.data;
  if (payload?.code !== 200 || !source || !Array.isArray(source.bots) || source.bots.length > 10_000
    || typeof payload.partial !== 'boolean' || typeof payload.updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(payload.updatedAt)
    || !Number.isFinite(Date.parse(payload.updatedAt))) throw new Error('INVALID_EMO_PAYLOAD');

  const data = Object.fromEntries(COUNT_FIELDS.map(key => [key, count(source[key])]));
  if (data.uniqueGroups > data.totalGroups || data.duplicateGroups !== data.totalGroups - data.uniqueGroups
    || data.cachedBots > data.failedBots) throw new Error('INVALID_EMO_TOTALS');
  // Only publish aggregate counts and masked identifiers; never copy upstream objects or messages.
  data.bots = source.bots.map(bot => {
    const groupCount = count(bot?.groupCount);
    const uniqueGroupCount = count(bot?.uniqueGroupCount);
    if (uniqueGroupCount > groupCount) throw new Error('INVALID_EMO_TOTALS');
    const id = String(bot.botId ?? '');
    return {
      botId: /^\d{2}\*{3}\d{2}$/.test(id) ? id : /^\d{7,}$/.test(id) ? `${id.slice(0, 2)}***${id.slice(-2)}` : '***',
      type: BOT_TYPES.has(bot.type) ? bot.type : '其他',
      groupCount, uniqueGroupCount,
      status: BOT_STATUSES.has(bot.status) ? bot.status : '未知',
    };
  });
  return { data, partial: payload.partial || data.failedBots > data.cachedBots, updatedAt: new Date(payload.updatedAt).toISOString() };
}

function validRoot(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

// 兼容不带 scheme 的配置，统一按 http 补全（注意 host:port 里的冒号不是协议，只有 http(s):// 才算）；
// 含账号密码、查询或片段的写法一律视为配置错误。
function parseBaseUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return { url: null, invalid: false };
  return { url: validRoot(/^https?:\/\//i.test(text) ? text : `http://${text}`), invalid: true };
}

async function readJson(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('EMO_UNAVAILABLE');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('EMO_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createEmoClient({ baseUrl, guobaBaseUrl = '', token = '', fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 30_000, retryMs = 60_000, now = Date.now } = {}) {
  // 显式配置优先（空串 = 关闭），否则沿用锅巴地址的源，与旧行为一致。
  const configured = parseBaseUrl(baseUrl == null ? validRoot(guobaBaseUrl)?.origin ?? '' : baseUrl);
  const root = configured.url;
  /** 写了地址却解析不出来（带账号密码、查询串等）：按配置错误处理，明确禁用则不算错误 */
  const misconfigured = configured.invalid && !root;
  if (root) root.pathname = `${root.pathname.replace(/\/+$/, '')}/`;
  /**
   * 上游 JiuLi 在 config/config/server.yaml 配了 auth.access_token 时，/api/emo/stats 需要带 token。
   * 只放进请求头，不进 URL（避免出现在日志 / 浏览历史里），也从不回传给浏览器。
   */
  const accessToken = String(token ?? '').trim();
  const headers = accessToken
    ? { Accept: 'application/json', access_token: accessToken, Host: root?.host ?? '' }
    : { Accept: 'application/json' };
  const upstream = new URL('api/emo/stats', root || 'http://invalid');
  let cached;
  let cacheUntil = 0;
  let inFlight;

  return {
    async getStats() {
      if (misconfigured) return { configured: true, data: null, partial: false, updatedAt: null, fetchedAt: null, error: '群组统计连接配置有误，请联系管理员。', retryAt: null };
      if (!root) return { configured: false, data: null, partial: false, updatedAt: null, fetchedAt: null, error: null, retryAt: null };
      if (cached && now() < cacheUntil) return cached;
      if (inFlight) return inFlight;
      inFlight = (async () => {
        try {
          const response = await fetchImpl(upstream, {
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
          });
          const stats = sanitizeGroupStats(await readJson(response));
          cached = { configured: true, ...stats, fetchedAt: new Date(now()).toISOString(), error: null, retryAt: null };
          cacheUntil = now() + cacheMs;
        } catch {
          cacheUntil = now() + retryMs;
          cached = { configured: true, data: null, partial: false, updatedAt: null, fetchedAt: null, error: '群组统计暂时不可用，请稍后重试。', retryAt: new Date(cacheUntil).toISOString() };
        }
        return cached;
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
}
