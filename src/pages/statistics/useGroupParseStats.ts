import { useCallback, useEffect, useRef, useState } from 'react';
import type { GroupParseStatistics } from './types';

// 按群查询由用户主动触发，不参与自动轮询；同一时刻只保留最后一个请求。
export default function useGroupParseStats() {
  const [snapshot, setSnapshot] = useState<GroupParseStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const lookup = useCallback(async (groupId: string) => {
    const id = groupId.trim();
    // 群号必须与后端一致：仅纯数字且长度合理，避免把明显无效的输入发出去。
    if (!/^\d{5,20}$/.test(id)) {
      controller.current?.abort();
      controller.current = null;
      setSnapshot(null);
      setQueried(null);
      setError('请填写有效的群号（5-20 位数字）。');
      setLoading(false);
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch(`/api/parse-stats/group?group_id=${encodeURIComponent(id)}`, { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (typeof body?.configured !== 'boolean' || typeof body?.exists !== 'boolean') throw new Error('Invalid response');
      if (!response.ok) throw new Error(body?.error || 'Invalid response');
      if (current.signal.aborted) return;
      // 群号只在这次查询内用于请求，界面只展示服务端回传的掩码群号。
      setSnapshot(body);
      setQueried(body.data?.groupId ?? null);
      setError(null);
    } catch {
      if (current.signal.aborted) return;
      setSnapshot(null);
      setQueried(null);
      setError('暂时无法查询该群的解析统计，请稍后重试。');
    } finally {
      if (controller.current === current) controller.current = null;
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setSnapshot(null);
    setQueried(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

  return { snapshot, error, loading, queried, lookup, clear };
}
