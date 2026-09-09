import { useCallback, useEffect, useRef, useState } from 'react';
import type { Status } from '../types';

export default function useStatusData(hours: number, automatic: boolean, enabled: boolean) {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch(`/api/status?hours=${hours}`, { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (!body.logs || !body.metrics) throw new Error(body.error || '状态数据暂时无法获取，请重试。');
      if (current.signal.aborted) return;
      setData(body);
      setError(null);
    } catch (error) {
      if (current.signal.aborted) return;
      setError(error instanceof Error && error.message !== 'Failed to fetch' && !error.message.includes('JSON') ? error.message : '无法连接状态服务，请检查网络后重试。');
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [hours]);
  useEffect(() => { setData(null); }, [hours]);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return () => controller.current?.abort();
  }, [refresh, enabled]);
  useEffect(() => {
    if (!automatic || !enabled) return;
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [automatic, refresh, enabled]);
  return { data, loading, error, refresh };
}
