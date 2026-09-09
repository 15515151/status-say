import type { ReactNode } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';

type Props = {
  automatic: boolean;
  setAutomatic: (value: boolean) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshLabel?: string;
  children?: ReactNode;
};

export default function RefreshControls({ automatic, setAutomatic, loading, refresh, refreshLabel = '立即刷新', children }: Props) {
  const toggleLabel = automatic ? '暂停自动刷新' : '开启自动刷新';
  return <div className="toolbar-controls">
    <button className={`auto-button ${automatic ? 'enabled' : ''}`} onClick={() => setAutomatic(!automatic)} aria-pressed={automatic} aria-label={toggleLabel} title={toggleLabel}>{automatic ? <Pause size={12} /> : <Play size={12} />}<span>{automatic ? '实时刷新中' : '已暂停刷新'}</span></button>
    {children}
    <button className="icon-button refresh-button" aria-label={refreshLabel} title={refreshLabel} onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /></button>
  </div>;
}
