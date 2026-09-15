import { ArrowDownLeft, ArrowUpRight, CircleAlert, CircleCheck, CircleX, Cpu, HardDrive, Info, MemoryStick, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { bytes, fmt, rate, uptimeText } from '../../lib/format';
import type { ServerMetricPoint, ServerStatus } from '../../types';
import ServerSparkline from './ServerSparkline';

type Props = { server: ServerStatus };

const presenceText: Record<ServerStatus['presence'], string> = {
  online: '在线',
  offline: '数据过期',
  unavailable: '暂不可用',
};

const percentOf = (used: number | null, total: number | null) => {
  if (used == null || total == null || total <= 0) return null;
  return Math.min(100, Math.max(0, used / total * 100));
};

function ResourceRow({ icon: Icon, label, value, detail, trend, tone }: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  detail: string;
  trend: ServerMetricPoint[];
  tone: 'green' | 'blue' | 'amber';
}) {
  const display = value == null ? '—' : `${fmt(value, 1)}%`;
  return <div className={`server-resource ${tone} ${value == null ? 'is-empty' : ''}`}>
    <div className="server-resource-label"><span className={`server-resource-icon ${tone}`}><Icon size={14} strokeWidth={1.7} /></span><span>{label}</span></div>
    <div className="server-resource-value mono">{display}</div>
    <div className="server-resource-track" aria-hidden="true"><span style={{ width: `${value ?? 0}%` }} /></div>
    <div className="server-resource-detail">{detail}</div>
    <ServerSparkline points={trend} label={label} tone={tone} />
  </div>;
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="server-detail"><span><Icon size={13} strokeWidth={1.7} />{label}</span><b className="mono">{value}</b></div>;
}

export default function ServerCard({ server }: Props) {
  const latest = server.latest;
  const PresenceIcon = server.presence === 'online' ? CircleCheck : server.presence === 'offline' ? CircleAlert : CircleX;
  const memoryPercent = percentOf(latest?.memoryUsed ?? null, latest?.memoryTotal ?? null);
  const diskPercent = percentOf(latest?.diskUsed ?? null, latest?.diskTotal ?? null);
  const formattedLastSeen = server.lastSeen
    ? new Date(server.lastSeen).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '暂无上报';
  return <article className={`server-card presence-${server.presence}`} aria-labelledby={`server-${server.id}`}>
    <div className="server-card-body">
      <header className="server-card-header">
        <div className="server-card-identity">
          <span className="server-region">{server.region || '未标注地区'}</span>
          <h2 id={`server-${server.id}`}>{server.name}</h2>
          <div className="server-tags">{server.tags.length > 0 ? server.tags.map(tag => <span key={tag}>{tag}</span>) : <span>未设置标签</span>}</div>
        </div>
        <span className="server-presence"><PresenceIcon size={14} strokeWidth={1.8} />{presenceText[server.presence]}</span>
      </header>

      <div className="server-system"><span title={server.cpuName}><Cpu size={13} />{server.cpuName || 'CPU 未提供'}{server.cpuCores == null ? '' : ` · ${server.cpuCores} 核`}</span><span>{server.os || '系统未知'}</span><span>{server.arch || '架构未知'}</span></div>

      {server.error && <div className="server-card-notice" role="status"><Info size={14} /><span>{server.error}</span></div>}

      <div className="server-resource-list" aria-label={`${server.name}资源占用`}>
        <ResourceRow icon={Cpu} label="CPU" value={latest?.cpuPercent ?? null} detail="当前使用率" trend={server.history.cpu} tone="green" />
        <ResourceRow icon={MemoryStick} label="内存" value={memoryPercent} detail={latest ? `${bytes(latest.memoryUsed)} / ${bytes(latest.memoryTotal)}` : '暂无容量数据'} trend={server.history.memory} tone="blue" />
        <ResourceRow icon={HardDrive} label="磁盘" value={diskPercent} detail={latest ? `${bytes(latest.diskUsed)} / ${bytes(latest.diskTotal)}` : '暂无容量数据'} trend={server.history.disk} tone="amber" />
      </div>

      <div className="server-subheading"><span>网络流量</span><small>当前速率 / 累计</small></div>
      <div className="server-network-grid">
        <div className="server-network-item"><span><ArrowUpRight size={13} />上传</span><b className="mono">{rate(latest?.uploadBps)}</b><small className="mono">{bytes(latest?.totalUpload)}</small></div>
        <div className="server-network-item"><span><ArrowDownLeft size={13} />下载</span><b className="mono">{rate(latest?.downloadBps)}</b><small className="mono">{bytes(latest?.totalDownload)}</small></div>
      </div>

      <div className="server-subheading"><span>运行详情</span><small>最近 1 小时采样</small></div>
      <div className="server-details-grid">
        <Detail icon={Timer} label="运行时长" value={uptimeText(latest?.uptimeSeconds)} />
        <Detail icon={Cpu} label="Load 1 / 5 / 15" value={latest ? `${fmt(latest.load1, 2)} / ${fmt(latest.load5, 2)} / ${fmt(latest.load15, 2)}` : '—'} />
        <Detail icon={CircleCheck} label="TCP / UDP" value={latest ? `${fmt(latest.tcpConnections)} / ${fmt(latest.udpConnections)}` : '—'} />
        <Detail icon={HardDrive} label="进程数" value={fmt(latest?.processCount)} />
      </div>
    </div>
    <footer className="server-card-footer"><span className="server-last-seen"><span className="status-dot" />最近上报 {formattedLastSeen}</span><span>趋势窗口 1 小时</span></footer>
  </article>;
}
