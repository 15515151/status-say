import { createHmac, randomBytes } from 'node:crypto';

// 取值来自 rconsole-plugin/constants/resolve.js，不接受上游的任何自由文本标签。
const PLATFORMS = new Set(['哔哩哔哩', '抖音', 'TikTok', 'Twitter', 'Instagram', 'Acfun', '小红书', '波点', '通用（包含快手等）', 'YouTube', '米游社', '网易云音乐', '微博', '微视', '最右', 'AM+Spotify', '扣扣音乐', '酷狗音乐', '汽水音乐', '小飞机', '贴吧', '小黑盒', '视频号', 'AI总结']);
const MAX_BODY_BYTES = 1024 * 1024;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const seconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const duration = value => typeof value === 'string' && /^(?:\d{1,10}小时\d{1,2}分|\d{1,10}分\d{1,2}秒|\d{1,10}(?:\.\d{1,2})?秒)$/.test(value) ? value : null;
const bytes = value => typeof value === 'string' && /^\d{1,15}(?:\.\d{1,2})? (?:B|KB|MB|GB)$/.test(value) ? value : null;

// 把上游的时长文本转成秒，仅用于排序与合计；无法解析时返回 null。
// 接受「X小时Y分」「X分Y秒」「X秒」三种形式，与 duration() 的正则保持一致。
function durationSeconds(value) {
  if (typeof value !== 'string') return null;
  const hour = /^(\d{1,10})小时(\d{1,2})分$/.exec(value);
  if (hour) {
    const total = Number(hour[1]) * 3600 + Number(hour[2]) * 60;
    return Number.isSafeInteger(total) ? total : null;
  }
  const minute = /^(\d{1,10})分(\d{1,2})秒$/.exec(value);
  if (minute) {
    const total = Number(minute[1]) * 60 + Number(minute[2]);
    return Number.isSafeInteger(total) ? total : null;
  }
  const second = /^(\d{1,10})(?:\.\d{1,2})?秒$/.exec(value);
  if (second) {
    const total = Number(second[1]);
    return Number.isSafeInteger(total) ? total : null;
  }
  return null;
}

function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`2000-${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(5, 10) === value ? value : null;
}

// 群头像来源：上游给的是 qlogo 链接，路径里含真实群号，因此只留在服务端。
// 对外暴露的是按群号派生的不透明 ID，浏览器无法反推群号。
function groupAvatarSource(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    // 带查询串、片段、端口或凭据的地址一律拒绝，而不是静默丢弃其多余部分。
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    if (url.hostname !== 'p.qlogo.cn' && !url.hostname.endsWith('.qlogo.cn')) return null;
    // 只接受 GH 群头像路径（/gh/<群号>/<群号>/<尺寸>），避免转发任意 qlogo 资源。
    if (!/^\/gh\/\d{5,20}\/\d{5,20}\/\d{1,4}$/.test(url.pathname)) return null;
    return `https://${url.hostname}${url.pathname}`;
  } catch { return null; }
}

export function sanitizeParseStats(payload, { groupIdSecret, registerGroupAvatar } = {}) {
  const source = payload?.data;
  if (payload?.code !== 0 || source?.mode !== 'global' || count(source.totalParses) === null
    || !Array.isArray(source.platformRows) || !Array.isArray(source.historyRows)
    || source.platformRows.length > 100 || source.historyRows.length > 366) {
    throw new Error('INVALID_RCONSOLE_PAYLOAD');
  }

  // 平台名是唯一允许对外发布的上游名称；未知标签一律并入固定分类。
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

  // 群排行：只保留脱敏群号与聚合计数。群名是任意文本（可能含真名、公司名等），
  // 无法用正则约束，因此整项丢弃。群头像改由本站代理转发，对外只暴露不透明 ID。
  const topGroups = Array.isArray(source.topGroups) ? source.topGroups.slice(0, 20).map(row => {
    const rawId = typeof row?.groupId === 'string' ? row.groupId.trim() : '';
    const masked = maskGroupId(rawId);
    const total = count(row?.count);
    if (!masked || total === null) return null;
    // 头像 ID 由随机密钥派生：同一进程内稳定（前端可缓存），重启即失效，且不可反推群号。
    const avatarSource = groupAvatarSource(row?.groupAvatar);
    const avatarId = avatarSource && groupIdSecret
      ? createHmac('sha256', groupIdSecret).update(rawId).digest('hex').slice(0, 24) : null;
    if (avatarId) registerGroupAvatar?.(avatarId, avatarSource);
    return {
      groupId: masked,
      count: total,
      users: count(row.users),
      avatarPath: avatarId ? `/api/parse-stats/group-avatar/${avatarId}` : null,
    };
  }).filter(Boolean) : [];

  // 平台媒体时长排行：上游给的是时长文本（如「207小时33分」），先转成秒再排序。
  // 平台名走同一份白名单，未知并入「其他」并累加。
  const mediaRank = new Map();
  if (Array.isArray(source.platformMediaRank)) {
    for (const row of source.platformMediaRank.slice(0, 100)) {
      const parsed = durationSeconds(row?.totalText);
      if (parsed === null) continue;
      const name = PLATFORMS.has(row.name) ? row.name : '其他';
      const entry = mediaRank.get(name) ?? { videoSeconds: 0, audioSeconds: 0, totalSeconds: 0 };
      entry.videoSeconds += durationSeconds(row.videoText) ?? 0;
      entry.audioSeconds += durationSeconds(row.audioText) ?? 0;
      entry.totalSeconds += parsed;
      if (!Number.isSafeInteger(entry.videoSeconds) || !Number.isSafeInteger(entry.audioSeconds) || !Number.isSafeInteger(entry.totalSeconds)) continue;
      mediaRank.set(name, entry);
    }
  }
  const platformMedia = [...mediaRank].map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  // 每一层都新建对象：各类 ID、名称、头像、排行、路径与图片渲染字段都不会离开服务端。
  return {
    totalParses: source.totalParses,
    totalUsers: count(source.totalUsers),
    // 参与群数只是聚合计数，不携带群号，与 totalUsers 同级。
    totalGroups: count(source.totalGroups),
    platforms: [...platforms].map(([name, total]) => ({ name, count: total })).sort((a, b) => b.count - a.count),
    history,
    // 上游的 hasHistory / hasMediaRank 只作为数据可用性标志，不直接透传。
    hasHistory: source.hasHistory === true,
    topGroups,
    platformMedia,
    // 近 30 天媒体总时长（上游 mediaTrendText），与媒体块里的累计总时长不是同一口径。
    mediaTrendSeconds: durationSeconds(source.mediaTrendText),
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

// 群号脱敏规则与账号 UIN 一致：123456789 -> 12****89。
// 位数不足的值不回显任何数字，避免异常 id 把上游原文带出来。
export function maskGroupId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^\d{7,}$/.test(id) ? `${id.slice(0, 2)}****${id.slice(-2)}` : null;
}

// 只允许纯数字且长度合理的群号发往上游，其余一律视为无效。
export function normalizeGroupId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^\d{5,20}$/.test(id) ? id : null;
}

// 按群统计的结构与全局页不同：没有历史趋势，改为群内累计、群排行与全局对照。
// 只保留已登记的聚合字段；回显的群号一律是脱敏后的形式。
export function sanitizeGroupParseStats(payload, groupId) {
  const source = payload?.data;
  // 群端点的累计字段是 groupTotal（不是全局页的 totalParses），用户数是 uniqueUsers。
  if (payload?.code !== 0 || source?.mode !== 'group' || count(source.groupTotal) === null
    || !Array.isArray(source.platformRows) || source.platformRows.length > 100) {
    throw new Error('INVALID_RCONSOLE_GROUP_PAYLOAD');
  }
  const masked = maskGroupId(groupId);
  if (!masked) throw new Error('INVALID_RCONSOLE_GROUP_ID');

  // 平台名是唯一允许对外发布的自由文本；未知平台一律并入固定分类。
  const platforms = new Map();
  for (const row of source.platformRows) {
    const total = count(row?.count);
    if (total === null) throw new Error('INVALID_RCONSOLE_COUNT');
    const name = PLATFORMS.has(row.name) ? row.name : '其他';
    const combined = (platforms.get(name) ?? 0) + total;
    if (!Number.isSafeInteger(combined)) throw new Error('INVALID_RCONSOLE_COUNT');
    platforms.set(name, combined);
  }
  const media = source.media ?? {};
  const successCount = count(media.successCount);
  const failureCount = count(media.failureCount);
  const attempts = successCount === null || failureCount === null ? null : successCount + failureCount;

  // 每一层都新建对象：真实群号、群名、头像、成员 QQ 号、昵称、头像与上游 topUsers 排行全部丢弃。
  return {
    groupId: masked,
    totalParses: source.groupTotal,
    totalUsers: count(source.uniqueUsers),
    // 群排行与全局对照都是不含身份的聚合计数，用于说明该群在整体中的位置。
    groupRank: count(source.groupRank),
    globalTotal: count(source.globalTotal),
    globalGroups: count(source.globalGroups),
    platforms: [...platforms].map(([name, total]) => ({ name, count: total })).sort((a, b) => b.count - a.count),
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

export function createRconsoleClient({ baseUrl, guobaBaseUrl = '', groupPath = 'rconsole/api/parse-stats/group', groupParam = 'group_id', fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 30_000, retryMs = 60_000, now = Date.now } = {}) {
  const configuredUrl = baseUrl ?? validRoot(guobaBaseUrl)?.origin ?? '';
  const configured = Boolean(configuredUrl);
  const root = validRoot(configuredUrl);
  if (root) root.pathname = `${root.pathname.replace(/\/+$/, '')}/`;
  let cached;
  let cacheUntil = 0;
  let inFlight;
  // 按群查询按群号分别缓存与合并，避免某个群响应慢时拖住其它群。
  const groupCache = new Map();
  const groupInFlight = new Map();
  // 群头像的密钥与真实地址注册表都只存在于服务端内存中。
  const groupIdSecret = randomBytes(32);
  const groupAvatarSources = new Map();

  return {
    // 只按不透明 ID 返回群头像地址；调用方拿不到群号。
    getGroupAvatarSource(id) { return groupAvatarSources.get(id) ?? null; },

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
          const data = sanitizeParseStats(await readJson(response), {
            groupIdSecret,
            registerGroupAvatar: (id, source) => groupAvatarSources.set(id, source),
          });
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

    // 查询单个群的解析统计。原始群号只用于上游请求与缓存键，响应里回显的是脱敏群号。
    async getGroupStats(groupId) {
      const id = normalizeGroupId(groupId);
      if (!id) return { configured, exists: false, data: null, fetchedAt: null, error: '请填写有效的群号。', retryAt: null };
      if (!configured) return { configured: false, exists: false, data: null, fetchedAt: null, error: null, retryAt: null };
      const hit = groupCache.get(id);
      if (hit && now() < hit.expires) return hit.value;
      if (groupInFlight.has(id)) return groupInFlight.get(id);
      const request = (async () => {
        try {
          if (!root) throw new Error('RCONSOLE_CONFIGURATION');
          const target = new URL(groupPath, root);
          target.searchParams.set(groupParam, id);
          const response = await fetchImpl(target, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
          });
          const raw = await readJson(response);
          // 结构正常的「查无此群」不是错误，按空结果返回。
          if (raw?.code === 0 && raw?.data == null) {
            const empty = { configured: true, exists: false, data: null, fetchedAt: new Date(now()).toISOString(), error: null, retryAt: null };
            groupCache.set(id, { value: empty, expires: now() + cacheMs });
            return empty;
          }
          const value = { configured: true, exists: true, data: sanitizeGroupParseStats(raw, id), fetchedAt: new Date(now()).toISOString(), error: null, retryAt: null };
          groupCache.set(id, { value, expires: now() + cacheMs });
          return value;
        } catch {
          // 与全局统计一致：失败结果同样进入冷却缓存，冷却期内不重复打上游。
          const retryAt = now() + retryMs;
          const failure = { configured: true, exists: false, data: null, fetchedAt: null, error: root ? '该群的解析统计暂时不可用，请稍后重试。' : '解析统计连接配置有误，请联系管理员。', retryAt: new Date(retryAt).toISOString() };
          groupCache.set(id, { value: failure, expires: retryAt });
          return failure;
        }
      })();
      groupInFlight.set(id, request);
      try { return await request; } finally { groupInFlight.delete(id); }
    },
  };
}
