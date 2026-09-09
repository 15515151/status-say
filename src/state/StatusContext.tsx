import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import useStatusData from '../hooks/useStatusData';

function useStatusState() {
  const [hours, setHours] = useState(24);
  const [automatic, setAutomatic] = useState(true);
  const [groupName, setGroupName] = useState('default');
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const { data, loading, error, refresh } = useStatusData(hours, automatic, path === '/' || path === '/requests');
  const group = data?.metrics.data?.groups.find(item => item.name === groupName) ?? data?.metrics.data?.groups[0];
  const timestamp = data ? new Date(data.fetchedAt).getTime() / 1000 : Date.now() / 1000;
  const logs = useMemo(() => (data?.logs.data ?? []).filter(log => log.model === data?.model && (!group || log.group === group.name) && log.createdAt !== null && log.createdAt >= timestamp - hours * 3600 && log.createdAt <= timestamp), [data, group, hours, timestamp]);
  const hasMetrics = !!group && group.series.length > 0 && group.successRate !== null;
  const allUnavailable = !!error || (!!data && !!data.logs.error && !!data.metrics.error);
  const degraded = !allUnavailable && (!!data?.logs.error || !!data?.metrics.error || (hasMetrics && group!.successRate! < 99));
  const healthy = hasMetrics && !allUnavailable && !degraded;
  const stateLabel = loading && !data ? '正在连接' : allUnavailable ? '连接异常' : degraded ? '部分异常' : healthy ? '运行正常' : '等待数据';
  const warnings = [error, data?.metrics.error, data?.logs.error].filter(Boolean);
  return { hours, setHours, automatic, setAutomatic, groupName, setGroupName, data, loading, error, refresh, group, timestamp, logs, allUnavailable, degraded, healthy, stateLabel, warnings };
}

const StatusContext = createContext<ReturnType<typeof useStatusState> | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const value = useStatusState();
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error('useStatus must be used inside StatusProvider');
  return value;
}
