import { Info } from 'lucide-react';
import { useStatus } from '../../state/StatusContext';

export default function StatusWarning() {
  const { warnings, allUnavailable, error, data, refresh, loading } = useStatus();
  if (warnings.length === 0) return null;
  return <div className="warning-banner" role="alert"><Info size={18} /><div><strong>{allUnavailable ? '暂时无法更新状态' : '部分数据暂时不可用'}</strong><p>{[...new Set(warnings)].join(' ')}{error && data ? ' 当前保留上次成功获取的数据。' : ''}</p></div><button onClick={() => void refresh()} disabled={loading}>重新连接</button></div>;
}
