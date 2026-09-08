const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = (value) => finite(value) !== null && value >= 0 ? value : null;
const text = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : '';

// All fields returned to browsers are explicitly selected. Never forward raw payloads.
export function sanitizeLogs(payload, secret = '') {
  if (payload?.success !== true || !Array.isArray(payload.data)) {
    throw new Error('INVALID_UPSTREAM_PAYLOAD');
  }
  const safeText = (value) => {
    let result = text(value);
    if (secret) result = result.split(secret).join('[redacted]');
    return result.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]');
  };
  return payload.data.filter(row => row && typeof row === 'object')
    .map((row, index) => {
      let other = {};
      try { other = typeof row.other === 'string' ? JSON.parse(row.other) : row.other ?? {}; } catch { /* optional metadata */ }
      if (!other || typeof other !== 'object') other = {};
      return {
        id: finite(row.id) ?? index,
        createdAt: nonnegative(row.created_at),
        // New API: 2 = consumption; 5 = failed request. Other records are not AI requests.
        status: row.type === 2 ? 'success' : row.type === 5 ? 'error' : 'other',
        model: safeText(row.model_name),
        upstreamModel: safeText(other.upstream_model_name),
        group: safeText(row.group),
        promptTokens: nonnegative(row.prompt_tokens),
        completionTokens: nonnegative(row.completion_tokens),
        cacheTokens: nonnegative(other.cache_tokens),
        durationSeconds: nonnegative(row.use_time),
        streaming: row.is_stream === true,
        firstTokenMs: nonnegative(other.frt),
      };
    }).filter(row => row.status !== 'other')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

const metric = (row) => ({
  // 0 TTFT on non-streaming requests means no measurement, not instantaneous response.
  ttftMs: nonnegative(row.avg_ttft_ms) > 0 ? row.avg_ttft_ms : null,
  latencyMs: nonnegative(row.avg_latency_ms),
  successRate: finite(row.success_rate) !== null && row.success_rate >= 0 && row.success_rate <= 100 ? row.success_rate : null,
  tokensPerSecond: nonnegative(row.avg_tps),
});

export function sanitizeMetrics(payload, secret = '') {
  if (payload?.success !== true || !payload.data || !Array.isArray(payload.data.groups)) {
    throw new Error('INVALID_UPSTREAM_PAYLOAD');
  }
  const safeText = (value) => {
    let result = text(value);
    if (secret) result = result.split(secret).join('[redacted]');
    return result.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]');
  };
  return {
    model: safeText(payload.data.model_name),
    groups: payload.data.groups.filter(group => group && typeof group === 'object').map(group => ({
      name: safeText(group.group),
      ...metric(group),
      series: (Array.isArray(group.series) ? group.series : [])
        .filter(point => point && nonnegative(point.ts) !== null)
        .map(point => ({ timestamp: point.ts, ...metric(point) }))
        .sort((a, b) => a.timestamp - b.timestamp),
    })),
  };
}
