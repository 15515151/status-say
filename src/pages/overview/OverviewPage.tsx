import { Activity, CircleCheck, Database, Layers, Server, Signal, Timer, Zap } from 'lucide-react';
import BotIllustration, { LeafMark } from '../../components/brand/BotIllustration';
import PageLayout from '../../components/layout/PageLayout';
import StatusToolbar from '../../components/status/StatusToolbar';
import StatusWarning from '../../components/status/StatusWarning';
import { useStatus } from '../../state/StatusContext';
import { fmt } from '../../lib/format';
import type { Metric } from '../../types';
import PerformanceChart from './PerformanceChart';
import './overview.css';

const number = new Intl.NumberFormat('zh-CN');

export default function OverviewPage() {
  const { hours, data, loading, error, group, setGroupName, timestamp, logs, allUnavailable, degraded, healthy, stateLabel } = useStatus();
  const logAvailable = data?.logs.data != null;
  const totalTokens = logAvailable ? logs.reduce((total, log) => total + (log.promptTokens ?? 0) + (log.completionTokens ?? 0), 0) : null;
  const hasMissingTokens = logs.some(log => log.promptTokens === null || log.completionTokens === null);
  const totalInput = logs.reduce((total, log) => total + (log.promptTokens ?? 0), 0);
  const totalOutput = logs.reduce((total, log) => total + (log.completionTokens ?? 0), 0);
  const metrics: { label: string; key?: keyof Metric; value: number | null; unit: string; digits: number; icon: typeof Activity; note: string; color: string }[] = [
    { label: '请求成功率', value: group?.successRate ?? null, unit: '%', digits: 1, icon: CircleCheck, note: '所选时段 · 模型分组统计', color: 'green' },
    { label: '平均响应耗时', value: group?.latencyMs == null ? null : group.latencyMs / 1000, unit: 's', digits: 2, icon: Timer, note: '从发出请求到完成响应', color: 'blue' },
    { label: '平均生成速度', value: group?.tokensPerSecond ?? null, unit: 'tok/s', digits: 2, icon: Zap, note: '每秒生成的 Token 数', color: 'amber' },
    { label: 'Token 用量', value: totalTokens, unit: '', digits: 0, icon: Layers, note: `${hasMissingTokens ? '部分用量缺失 · ' : ''}当前返回的 ${logs.length} 条时段内请求`, color: 'violet' },
  ];

  return <PageLayout title="运行概览" healthy={healthy} stateLabel={stateLabel} fetchedAt={data?.fetchedAt} loading={loading}>
      <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><div className="eyebrow"><span className="tiny-leaf"><LeafMark size={16} /></span> XIANGCAI / LIVE STATUS</div><h1 id="hero-title">香菜，{allUnavailable ? '正在等待重连。' : degraded ? '有一点小波动。' : healthy ? '正在好好回应。' : '准备好回应。'}</h1><p>一棵香菜的工作日常。<span>在这里，看看每一次 AI 回应的状态。</span></p><div className="hero-meta"><span className={`health-badge ${healthy ? '' : 'neutral'}`}><span className="status-dot" />{healthy ? '模型服务正常' : stateLabel}</span><span className="hero-model"><Server size={13} />模型 <b className="mono">{data?.model ?? 'xc'}</b></span></div></div><BotIllustration /></section>

      <StatusToolbar title="运行概览" />
      <StatusWarning />

      <section className={`stats-grid ${loading && !data ? 'is-loading' : ''}`} aria-label="核心运行指标">{metrics.map(item => <article className="stat-card" key={item.label}><div className="stat-top"><span>{item.label}</span><span className={`stat-icon ${item.color}`}><item.icon size={17} strokeWidth={1.7} /></span></div><div className="stat-value mono">{fmt(item.value, item.digits)}<span>{item.unit}</span></div><div className="stat-bottom">{item.label === '请求成功率' && healthy ? <span className="small-dot" /> : null}{item.note}</div></article>)}</section>

      <div className="middle-grid"><PerformanceChart group={group} hours={hours} timestamp={timestamp} error={data?.metrics.error ?? error} loading={loading} />
        <section className="panel model-panel" aria-labelledby="model-title"><div className="panel-heading"><h2 id="model-title">当前模型</h2><span className="mini-caption">MODEL</span></div><div className="model-identity"><span className="model-avatar"><LeafMark size={29} /></span><div><strong className="mono">{data?.model ?? 'xc'}</strong><span>香菜的思考引擎</span></div><span className={`model-state ${healthy ? '' : 'neutral'}`}><span className="status-dot" />{healthy ? '可用' : '待确认'}</span></div>
          <dl className="model-facts"><div><dt><Database size={14} />服务分组</dt><dd>{(data?.metrics.data?.groups.length ?? 0) > 1 ? <select aria-label="模型分组" value={group?.name} onChange={event => setGroupName(event.target.value)}>{data?.metrics.data?.groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select> : <span className="code-chip">{group?.name ?? '—'}</span>}</dd></div><div><dt><Timer size={14} />平均首字耗时</dt><dd className="mono">{group?.ttftMs == null ? <span className="subtle">未测得</span> : `${fmt(group.ttftMs)} ms`}</dd></div><div><dt><Signal size={14} />有效采样</dt><dd><b className="mono">{group ? fmt(group.series.filter(point => point.timestamp >= timestamp - hours * 3600 && point.timestamp <= timestamp).length) : '—'}</b><span className="subtle"> 个</span></dd></div></dl>
          <div className="token-breakdown"><div className="token-breakdown-heading"><span>请求 Token 分布</span><span>当前记录</span></div><div className="token-bar" aria-label={`输入 ${number.format(totalInput)}，输出 ${number.format(totalOutput)} Token`}>{totalInput + totalOutput > 0 && <><span style={{ flex: totalInput }} /><span style={{ flex: totalOutput, minWidth: totalOutput > 0 ? 3 : 0 }} /></>}</div><div className="token-labels"><span><i className="input-dot" />输入 <b className="mono">{logAvailable ? fmt(totalInput) : '—'}</b></span><span><i className="output-dot" />输出 <b className="mono">{logAvailable ? fmt(totalOutput) : '—'}</b></span></div></div>
        </section>
      </div>

  </PageLayout>;
}
