import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeLogs, sanitizeMetrics } from './data.js';
import { createGuobaClient } from './guoba.js';
import { createAvatarProxy } from './avatars.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ baseUrl, apiKey, model = 'xc', fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 10_000, guoba = {}, avatars = {} }) {
  const upstream = new URL(baseUrl);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) {
    throw new Error('BOT_API_BASE_URL must be an HTTP(S) URL without credentials');
  }
  const app = express();
  const accounts = createGuobaClient(guoba);
  const avatarProxy = createAvatarProxy(avatars);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });

  const cache = new Map();
  const inFlight = new Map();
  // Liveness is independent of credentials or outages in the monitored services.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  async function readEndpoint(path, normalize) {
    const cached = cache.get(path);
    if (cached && Date.now() - cached.timestamp < cacheMs) return cached.value;
    if (inFlight.has(path)) return inFlight.get(path);
    const request = (async () => {
      const response = await fetchImpl(new URL(path, upstream), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        // Never send the authorization header to a redirect target.
        redirect: 'error',
      });
      if (!response.ok) throw new Error('UPSTREAM_UNAVAILABLE');
      const value = { data: normalize(await response.json(), apiKey), fetchedAt: new Date().toISOString() };
      cache.set(path, { value, timestamp: Date.now() });
      return value;
    })();
    inFlight.set(path, request);
    try { return await request; } finally { inFlight.delete(path); }
  }

  app.get('/api/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const hours = String(req.query.hours ?? '24');
    if (!['1', '6', '24', '72', '168'].includes(hours)) {
      return res.status(400).json({ error: '请选择支持的时间范围。' });
    }
    if (!apiKey || apiKey === 'replace-with-your-api-key') {
      return res.status(503).json({ error: '状态页尚未完成配置，请联系管理员。' });
    }
    const [logs, metrics] = await Promise.allSettled([
      readEndpoint('/api/log/token', sanitizeLogs),
      readEndpoint(`/api/perf-metrics?model=${encodeURIComponent(model)}&hours=${hours}`, sanitizeMetrics),
    ]);
    const available = logs.status === 'fulfilled' || metrics.status === 'fulfilled';
    return res.status(available ? 200 : 502).json({
      model,
      hours: Number(hours),
      logs: logs.status === 'fulfilled' ? { ...logs.value, error: null } : { data: null, fetchedAt: null, error: '请求记录暂时无法获取，请稍后重试。' },
      metrics: metrics.status === 'fulfilled' ? { ...metrics.value, error: null } : { data: null, fetchedAt: null, error: '模型指标暂时无法获取，请稍后重试。' },
      fetchedAt: new Date().toISOString(),
    });
  });
  app.get('/api/accounts', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const snapshot = await accounts.getAccounts();
    if (snapshot.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((Date.parse(snapshot.retryAt) - Date.now()) / 1000))));
    res.status(snapshot.error ? 503 : 200).json(snapshot);
  });
  app.get('/api/accounts/:id/avatar', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = req.params.id;
    const source = /^[a-f0-9]{24}$/.test(id) ? accounts.getAvatarSource(id) : null;
    if (!source) return res.status(404).json({ error: '该账号没有可用头像。' });
    try {
      const image = await avatarProxy.get(id, source);
      // Never copy upstream headers, redirects, URLs, cookies or error bodies.
      res.set({
        'Content-Type': image.type,
        'Cache-Control': `public, max-age=${image.maxAge}`,
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      return res.send(image.bytes);
    } catch { return res.status(502).json({ error: '头像暂时不可用。' }); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));

  const dist = resolve(projectRoot, 'dist');
  if (existsSync(dist)) app.use(express.static(dist, { dotfiles: 'deny' }));
  app.get('/', (_req, res) => existsSync(resolve(dist, 'index.html'))
    ? res.sendFile(resolve(dist, 'index.html'))
    : res.status(503).type('text').send('Run npm run build first, or use the Vite development server.'));
  app.use((_req, res) => res.status(404).type('text').send('Not found'));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: '服务暂时不可用，请稍后重试。' }));
  return app;
}
