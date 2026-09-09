import { ChevronDown, Clock3, Database } from 'lucide-react';
import { rangeOptions } from '../../lib/format';
import { useStatus } from '../../state/StatusContext';
import RefreshControls from './RefreshControls';

export default function StatusToolbar({ title, showGroup = false }: { title: string; showGroup?: boolean }) {
  const { automatic, setAutomatic, loading, refresh, hours, setHours, data, group, setGroupName } = useStatus();
  return <div className="overview-toolbar">
    <div className="section-label"><span className="section-square" /><h2>{title}</h2><span>{automatic ? '每 30 秒更新' : '自动刷新已暂停'}</span></div>
    <RefreshControls automatic={automatic} setAutomatic={setAutomatic} loading={loading} refresh={refresh}>
      {showGroup && (data?.metrics.data?.groups.length ?? 0) > 1 && <div className="select-wrap group-filter"><Database size={14} /><select aria-label="模型分组" value={group?.name} onChange={event => setGroupName(event.target.value)}>{data?.metrics.data?.groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select><ChevronDown size={13} /></div>}
      <div className="select-wrap"><Clock3 size={14} /><select aria-label="统计时间范围" value={hours} onChange={event => setHours(Number(event.target.value))}>{rangeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={13} /></div>
    </RefreshControls>
  </div>;
}
