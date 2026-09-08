import { createHmac, randomBytes } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { avatarSourceFor } from './avatars.js';

const SESSION_TTL = 24 * 60 * 60 * 1000;
const STATUS_LABELS = { 0: '离线', 11: '在线', 30: 'Q我吧', 40: '离开', 50: '隐身', 60: '忙碌', 70: '请勿打扰' };

export function maskUin(value) {
  const uin = String(value ?? '').trim();
  return uin.length > 4 ? `${uin.slice(0, 2)}****${uin.slice(-2)}` : '****';
}

function count(value) {
  // This plugin returns e.g. "123 收" for sent and "456 发" for recv.
  // Use the field semantics, discarding these inverted display suffixes.
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\s+\S+)?$/.test(value.trim()) ? Number(value.trim().split(/\s/)[0]) : NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

export function sanitizeAccounts(payload, { secrets = [], idSecret = randomBytes(32), registerAvatar } = {}) {
  if (payload?.ok !== true || payload.code !== 0 || !Array.isArray(payload.result?.list)) {
    throw new Error('INVALID_GUOBA_PAYLOAD');
  }
  const rows = payload.result.list.filter(row => row && typeof row === 'object');
  const uins = rows.map(row => String(row.uin ?? '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const safeText = (value, max = 100) => {
    if (typeof value !== 'string') return '';
    let safe = value;
    for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join('[已隐藏]');
    for (const uin of uins) safe = safe.split(uin).join(maskUin(uin));
    return safe.replace(/sk-[a-zA-Z0-9_-]+/g, '[已隐藏]').slice(0, max);
  };
  const list = rows.map((row, index) => {
    const status = typeof row.status === 'number' && Number.isInteger(row.status) ? row.status : null;
    const id = createHmac('sha256', idSecret).update(String(row.uin ?? `missing-${index}`)).digest('hex').slice(0, 24);
    const avatarSource = avatarSourceFor(row);
    if (avatarSource) registerAvatar?.(id, avatarSource);
    return {
      // A keyed ID lets React preserve cards without exposing (or plainly hashing) UINs.
      id,
      avatarPath: avatarSource ? `/api/accounts/${id}/avatar` : null,
      maskedUin: maskUin(row.uin),
      nickname: safeText(row.nickname) || '未命名账号',
      statusLabel: STATUS_LABELS[status] ?? '未知',
      connected: status === 0 ? false : Object.hasOwn(STATUS_LABELS, status) ? true : null,
      platform: safeText(row.platform) || '未知',
      botVersion: safeText(row.botVersion) || '未知',
      runtime: safeText(row.botRunTime, 60) || '未知',
      messages: { sent: count(row.messageCount?.sent), received: count(row.messageCount?.recv) },
      contacts: { friends: count(row.countContacts?.friend), groups: count(row.countContacts?.group), members: count(row.countContacts?.groupMember) },
      // The original avatar URL and UIN stay in the server's private registry.
    };
  });
  return { list, total: list.length };
}

class GuobaError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const errorMessages = {
  configuration: '账号状态服务配置有误，请联系管理员。',
  login: '账号状态暂时无法获取，请管理员检查登录配置。',
  expired: '账号状态连接已失效，稍后将自动重新连接。',
  forbidden: '账号状态访问受限，请联系管理员。',
  unavailable: '账号状态暂时无法获取，稍后将自动重试。',
};

export function createGuobaClient({ baseUrl = '', account = '', password = '', fetchImpl = fetch, timeoutMs = 8_000, cacheMs = 10_000, retryMs = 60_000, now = Date.now } = {}) {
  const configured = Boolean(baseUrl && account && password);
  const idSecret = randomBytes(32);
  let root;
  try {
    root = new URL(baseUrl);
    if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password || root.search || root.hash) root = null;
    if (root) root.pathname = `${root.pathname.replace(/\/+$/, '')}/`;
  } catch { root = null; }
  let jar = new CookieJar();
  let token = '';
  let expiresAt = 0;
  let inFlight;
  let cached;
  let cacheUntil = 0;
  let avatarSources = new Map();

  function clearSession() {
    token = '';
    expiresAt = 0;
    jar = new CookieJar();
  }

  async function request(path, { login = false } = {}) {
    const url = new URL(path, root);
    const headers = { Accept: 'application/json' };
    const cookie = await jar.getCookieString(url.href, { now: new Date(now()) });
    if (cookie) headers.Cookie = cookie;
    if (token && !login) headers['guoba-access-token'] = token;
    if (login) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(url, {
      method: login ? 'POST' : 'GET',
      headers,
      ...(login ? { body: JSON.stringify({ account, password }) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    for (const cookie of response.headers.getSetCookie()) {
      await jar.setCookie(cookie, url.href, { now: new Date(now()), ignoreError: true });
    }
    if (response.status === 401) throw new GuobaError(login ? 'login' : 'expired');
    if (response.status === 403) throw new GuobaError('forbidden');
    if (!response.ok) throw new GuobaError('unavailable');
    let body;
    try { body = await response.json(); } catch { throw new GuobaError('unavailable'); }
    if (body?.code === 401) throw new GuobaError(login ? 'login' : 'expired');
    if (body?.code === 403) throw new GuobaError('forbidden');
    if (body?.ok !== true || body.code !== 0) throw new GuobaError(login ? 'login' : 'unavailable');
    return body;
  }

  async function login() {
    clearSession();
    const startedAt = now();
    try {
      const body = await request('api/login/account-password', { login: true });
      token = typeof body.result?.token === 'string' ? body.result.token : '';
      // Header values must be safe even if the upstream response is malformed.
      if (token && !/^[\x21-\x7e]+$/.test(token)) throw new GuobaError('login');
      const cookies = await jar.getCookies(new URL('api/bot/online-list', root).href, { now: new Date(now()) });
      if (!token && cookies.length === 0) throw new GuobaError('login');
      expiresAt = startedAt + SESSION_TTL;
      // JWT expiry is only a refresh hint; the upstream always authenticates requests.
      try {
        const jwt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (Number.isFinite(jwt.exp)) expiresAt = Math.min(expiresAt, jwt.exp * 1000);
      } catch { /* This plugin's JWT normally has no exp claim. */ }
      if (!token) expiresAt = Math.min(expiresAt, ...cookies.map(cookie => cookie.expiryTime()));
    } catch (error) {
      clearSession();
      throw error;
    }
  }

  async function readAccounts() {
    if (!root) throw new GuobaError('configuration');
    if (now() >= expiresAt - 60_000) await login();
    let payload;
    try {
      payload = await request('api/bot/online-list');
    } catch (error) {
      if (!(error instanceof GuobaError) || error.code !== 'expired') throw error;
      // One re-login and one replay, including business-code 401 responses.
      await login();
      try { payload = await request('api/bot/online-list'); }
      catch (retryError) { clearSession(); throw retryError; }
    }
    const cookies = await jar.getCookies(new URL('api/bot/online-list', root).href, { now: new Date(now()) });
    const sources = new Map();
    const data = sanitizeAccounts(payload, {
      secrets: [account, password, token, ...cookies.map(cookie => cookie.value)], idSecret,
      registerAvatar: (id, url) => sources.set(id, url),
    });
    avatarSources = sources;
    return data;
  }

  return {
    getAvatarSource(id) { return avatarSources.get(id) ?? null; },
    async getAccounts() {
      if (!configured) return { configured: false, data: null, fetchedAt: null, error: null, retryAt: null };
      if (cached && now() < cacheUntil) return cached;
      // Coalesce the entire read/auth/retry flow across all visitors.
      if (inFlight) return inFlight;
      inFlight = (async () => {
        try {
          const data = await readAccounts();
          cached = { configured: true, data, fetchedAt: new Date(now()).toISOString(), error: null, retryAt: null };
          cacheUntil = now() + cacheMs;
        } catch (error) {
          const code = error instanceof GuobaError ? error.code : 'unavailable';
          // Failed attempts have a cooldown; browser refresh cannot create a login storm.
          cacheUntil = now() + retryMs;
          cached = { configured: true, data: null, fetchedAt: null, error: errorMessages[code] ?? errorMessages.unavailable, retryAt: new Date(cacheUntil).toISOString() };
        }
        return cached;
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
}
