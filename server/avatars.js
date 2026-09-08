const HOUR = 3_600_000;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function isQqAvatarUrl(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && (url.hostname === 'qlogo.cn' || url.hostname.endsWith('.qlogo.cn'));
}

export function avatarSourceFor(row) {
  // Guoba's botVersion is the adapter name; platform is the underlying QQ client.
  if (typeof row.botVersion !== 'string' || !/^(?:OneBot\s*v11|ICQQ|QQBot)(?:$|\s)/i.test(row.botVersion.trim())) return null;
  try {
    const url = new URL(row.avatarUrl);
    if (/^QQBot(?:$|\s)/i.test(row.botVersion.trim())) {
      // Official QQBot supplies an opaque, signed oidb URL, not a QQ UIN URL.
      // Older SDKs return HTTP; this specific Tencent endpoint also supports HTTPS.
      if (url.protocol === 'http:' && url.hostname === 'thirdqq.qlogo.cn' && !url.port) url.protocol = 'https:';
      if (!isQqAvatarUrl(url) || url.hostname !== 'thirdqq.qlogo.cn' || url.pathname !== '/g'
        || url.searchParams.get('b') !== 'oidb' || !url.searchParams.get('k')?.trim() || url.href.length > 4096) return null;
      const avatar = new URL('https://thirdqq.qlogo.cn/g');
      for (const key of ['b', 'k', 'kti', 's', 't']) {
        if (url.searchParams.has(key)) avatar.searchParams.set(key, url.searchParams.get(key));
      }
      return avatar.href;
    }
    const uin = String(row.uin ?? '');
    if (!/^[1-9]\d{4,19}$/.test(uin)) return null;
    if (!isQqAvatarUrl(url) || url.pathname !== '/g' || url.searchParams.get('b') !== 'qq' || url.searchParams.get('nk') !== uin) return null;
    // Preserve the known avatar host while excluding arbitrary query parameters.
    return `https://${url.hostname}/g?b=qq&s=100&nk=${uin}`;
  } catch { return null; }
}

function imageMatches(type, bytes) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (type === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

export function createAvatarProxy({ fetchImpl = fetch, now = Date.now, timeoutMs = 8_000, maxBytes = MAX_BYTES, maxEntries = 64 } = {}) {
  const cache = new Map();
  const inFlight = new Map();

  function save(id, entry) {
    cache.delete(id);
    cache.set(id, entry);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  async function download(source) {
    let url = new URL(source);
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    // QQ may redirect to another QQ avatar CDN. Validate every hop; never forward it.
    for (let hop = 0; hop < 4; hop++) {
      if (!isQqAvatarUrl(url)) throw new Error('INVALID_AVATAR_URL');
      response = await fetchImpl(url, {
        headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
        redirect: 'manual', signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || hop === 3) throw new Error('INVALID_AVATAR_REDIRECT');
        url = new URL(location, url);
        continue;
      }
      break;
    }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!response.ok || !TYPES.has(type) || Number(response.headers.get('content-length')) > maxBytes || !response.body) {
      await response.body?.cancel();
      throw new Error('INVALID_AVATAR_IMAGE');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('AVATAR_TOO_LARGE');
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (!imageMatches(type, bytes)) throw new Error('INVALID_AVATAR_IMAGE');
    return { bytes, type, expiresAt: now() + HOUR };
  }

  return {
    async get(id, source) {
      const cached = cache.get(id);
      if (cached?.source === source && now() < cached.expiresAt) {
        if (cached.failed) throw new Error('AVATAR_UNAVAILABLE');
        return { ...cached.image, maxAge: Math.max(0, Math.floor((cached.expiresAt - now()) / 1000)) };
      }
      const key = `${id}:${source}`;
      if (inFlight.has(key)) return inFlight.get(key);
      const work = (async () => {
        try {
          const image = await download(source);
          save(id, { source, image, expiresAt: image.expiresAt });
          return { ...image, maxAge: 3600 };
        } catch {
          // Avoid hammering a failing image host on every page visit.
          save(id, { source, failed: true, expiresAt: now() + 60_000 });
          throw new Error('AVATAR_UNAVAILABLE');
        }
      })();
      inFlight.set(key, work);
      try { return await work; } finally { inFlight.delete(key); }
    },
  };
}
