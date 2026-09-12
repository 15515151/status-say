import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeLogs, sanitizeMetrics } from './data.js';
import { createGuobaClient } from './guoba.js';
import { createAvatarProxy } from './avatars.js';
import { createRconsoleClient, normalizeGroupId } from './rconsole.js';
import { createEmoClient } from './emo.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ baseUrl, apiKey, model = 'xc', fetchImpl = fetch, timeoutMs = 12_000, cacheMs = 10_000, guoba = {}, avatars = {}, rconsole = {}, emo = {} }) {
  const upstream = new URL(baseUrl);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) {
    throw new Error('BOT_API_BASE_URL must be an HTTP(S) URL without credentials');
  }
  const app = express();
  const accounts = createGuobaClient(guoba);
  const avatarProxy = createAvatarProxy(avatars);
  const parseStats = createRconsoleClient({ guobaBaseUrl: guoba.baseUrl, ...rconsole });
  const groupStats = createEmoClient({ guobaBaseUrl: guoba.baseUrl, ...emo });
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
  // 群头像代理：按不透明 ID 取图，浏览器始终看不到真实群号与上游头像地址。
  app.get('/api/parse-stats/group-avatar/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = req.params.id;
    const source = /^[a-f0-9]{24}$/.test(id) ? parseStats.getGroupAvatarSource(id) : null;
    if (!source) return res.status(404).json({ error: '该群没有可用头像。' });
    try {
      const image = await avatarProxy.get(id, source);
      res.set({
        'Content-Type': image.type,
        'Cache-Control': `public, max-age=${image.maxAge}`,
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      return res.send(image.bytes);
    } catch { return res.status(502).json({ error: '群头像暂时不可用。' }); }
  });
  app.get('/api/parse-stats', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length > 0) return res.status(400).json({ error: '解析统计不支持查询参数。' });
    const snapshot = await parseStats.getStats();
    if (snapshot.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((Date.parse(snapshot.retryAt) - Date.now()) / 1000))));
    res.status(snapshot.error ? 503 : 200).json(snapshot);
  });
  // 单个群的解析统计。只接受群号这一个参数，响应中的群号已脱敏。
  app.get('/api/parse-stats/group', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const keys = Object.keys(req.query);
    if (keys.some(key => key !== 'group_id')) return res.status(400).json({ error: '按群查询只支持 group_id 参数。' });
    // 缺少或格式非法的群号属于请求问题，按 400 处理，不伪装成上游故障。
    if (!normalizeGroupId(req.query.group_id)) return res.status(400).json({ error: '请填写有效的群号。' });
    const snapshot = await parseStats.getGroupStats(req.query.group_id);
    if (snapshot.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((Date.parse(snapshot.retryAt) - Date.now()) / 1000))));
    res.status(snapshot.error ? 503 : 200).json(snapshot);
  });
  app.get('/api/group-stats', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length > 0) return res.status(400).json({ error: '群组统计不支持查询参数。' });
    const snapshot = await groupStats.getStats();
    if (snapshot.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((Date.parse(snapshot.retryAt) - Date.now()) / 1000))));
    res.status(snapshot.error ? 503 : 200).json(snapshot);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));

  const dist = resolve(projectRoot, 'dist');
  if (existsSync(dist)) app.use(express.static(dist, { dotfiles: 'deny' }));
  // Only public page routes fall back to the SPA; unknown APIs and files stay 404.
  app.get(['/', '/accounts', '/requests', '/statistics'], (_req, res) => existsSync(resolve(dist, 'index.html'))
    ? res.sendFile(resolve(dist, 'index.html'))
    : res.status(503).type('text').send('Run npm run build first, or use the Vite development server.'));
  app.use((_req, res) => res.status(404).type('text').send('Not found'));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: '服务暂时不可用，请稍后重试。' }));
  return app;
}
