import { useCallback, useEffect, useRef, useState } from 'react';
import type { GroupStats } from './groupStatsTypes';

export default function useGroupStats(automatic: boolean) {
  const [snapshot, setSnapshot] = useState<GroupStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch('/api/group-stats', { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (typeof body?.configured !== 'boolean' || (body.data && !Array.isArray(body.data.bots))
        || (!response.ok && !body.error)) throw new Error('Invalid response');
      if (current.signal.aborted) return;
      setSnapshot(body);
      setError(null);
    } catch {
      if (current.signal.aborted) return;
      setSnapshot(null);
      setError('暂时无法连接群组统计服务，请稍后重试。');
    } finally {
      if (controller.current === current) controller.current = null;
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { controller.current?.abort(); controller.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (!automatic) return;
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [automatic, refresh]);
  return { snapshot, error, loading, refresh };
}
