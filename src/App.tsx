import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock3, Copy, Database, ExternalLink, Info, Layers, Pause, Play, RefreshCw, Search, Server, Signal, Timer, X, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BotIllustration, { LeafMark } from './BotIllustration';
import AccountsPanel from './AccountsPanel';
import type { Group, Log, Metric, Status } from './types';

const number = new Intl.NumberFormat('zh-CN');
const fmt = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const time = (seconds: number | null, full = false) => seconds === null ? '时间未知' : new Date(seconds * 1000).toLocaleString('zh-CN', { ...(full ? { month: '2-digit', day: '2-digit' } as const : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const rangeOptions = [{ value: 1, label: '最近 1 小时' }, { value: 6, label: '最近 6 小时' }, { value: 24, label: '最近 24 小时' }, { value: 72, label: '最近 3 天' }, { value: 168, label: '最近 7 天' }];
type ChartKey = 'latencyMs' | 'tokensPerSecond' | 'successRate';
const chartModes: { key: ChartKey; label: string; unit: string; color: string }[] = [
  { key: 'latencyMs', label: '响应耗时', unit: 's', color: '#61834c' },
  { key: 'tokensPerSecond', label: '生成速度', unit: 'tok/s', color: '#5b86a6' },
  { key: 'successRate', label: '成功率', unit: '%', color: '#61834c' },
];

function useStatus(hours: number, automatic: boolean) {
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
  useEffect(() => {
    setData(null);
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  useEffect(() => {
    if (!automatic) return;
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [automatic, refresh]);
  return { data, loading, error, refresh };
}

function StatusPill({ success }: { success: boolean }) {
  return <span className={`status-pill ${success ? '' : 'is-error'}`}>{success ? <Check size={12} strokeWidth={2.5} /> : <X size={12} />} {success ? '成功' : '失败'}</span>;
}

function LogDetail({ log, close }: { log: Log | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (log) { dialog.current?.showModal(); setCopied(false); setCopyError(false); }
    else dialog.current?.close();
  }, [log]);
  async function copy() {
    if (!log) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
    } catch { setCopyError(true); }
  }
  return <dialog ref={dialog} className="detail-dialog" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    {log && <div className="dialog-inner">
      <div className="dialog-heading"><div><span className="eyebrow">REQUEST DETAIL</span><h2>请求详情 <span className="mono">#{log.id}</span></h2></div><button className="icon-button" onClick={close} aria-label="关闭详情"><X size={20} /></button></div>
      <div className="detail-status"><StatusPill success={log.status === 'success'} /><span>{time(log.createdAt, true)}</span></div>
      <dl className="detail-grid">
        <div><dt>请求模型</dt><dd>{log.model || '—'}</dd></div><div><dt>实际模型</dt><dd>{log.upstreamModel || '—'}</dd></div>
        <div><dt>请求耗时</dt><dd>{fmt(log.durationSeconds, 2)} s</dd></div><div><dt>请求方式</dt><dd>{log.streaming ? '流式响应' : '非流式响应'}</dd></div>
        <div><dt>输入 Token</dt><dd>{fmt(log.promptTokens)}</dd></div><div><dt>输出 Token</dt><dd>{fmt(log.completionTokens)}</dd></div>
        <div><dt>缓存 Token</dt><dd>{fmt(log.cacheTokens)}</dd></div><div><dt>分组</dt><dd>{log.group || '—'}</dd></div>
        <div><dt>首字耗时</dt><dd>{log.firstTokenMs == null ? '未提供有效测量' : `${fmt(log.firstTokenMs)} ms`}</dd></div>
      </dl>
      <div className="dialog-footer"><span role="status">{copyError ? '复制失败，请检查浏览器权限。' : '仅展示请求的运行数据'}</span><button className="button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制记录'}</button></div>
    </div>}
  </dialog>;
}

function PerformanceChart({ group, hours, timestamp, error, loading }: { group?: Group; hours: number; timestamp: number; error?: string | null; loading: boolean }) {
  const [mode, setMode] = useState<ChartKey>('latencyMs');
  const selected = chartModes.find(item => item.key === mode)!;
  const start = timestamp - hours * 3600;
  const points = (group?.series ?? []).filter(point => point.timestamp >= start && point.timestamp <= timestamp).map(point => ({
    timestamp: point.timestamp,
    value: point[mode] === null ? null : mode === 'latencyMs' ? point[mode]! / 1000 : point[mode],
  }));
  const validPoints = points.filter(point => point.value !== null);
  const average = group?.[mode];
  const avgValue = average == null ? null : mode === 'latencyMs' ? average / 1000 : average;
  return <section className="panel performance-panel" aria-labelledby="performance-title">
    <div className="panel-heading"><div><h2 id="performance-title">模型表现</h2><p>每一个采样点，都是一次真实的记录</p></div><div className="chart-tabs" aria-label="图表指标">{chartModes.map(item => <button key={item.key} className={mode === item.key ? 'active' : ''} onClick={() => setMode(item.key)} aria-pressed={mode === item.key}>{item.label}</button>)}</div></div>
    <div className="chart-summary"><span className="legend-dot" style={{ background: selected.color }} /><span>平均{selected.label}</span><strong className="mono">{fmt(avgValue, mode === 'successRate' ? 1 : 2)} <small>{selected.unit}</small></strong><span className="chart-period">{rangeOptions.find(item => item.value === hours)?.label}</span></div>
    <div className="chart-area" aria-label={`${selected.label}趋势，共 ${validPoints.length} 个有效采样点`}>
      {loading && !group ? <div className="chart-empty"><RefreshCw size={22} className="spinning" /><span>正在读取模型表现…</span></div> : error ? <div className="chart-empty"><Info size={23} /><span>{error}</span></div> : validPoints.length === 0 ? <div className="chart-empty"><Activity size={25} /><span>这个时段还没有有效的采样记录</span><small>可以切换更长的时间范围查看</small></div> : <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 4, left: -24 }}>
          <CartesianGrid stroke="#edf0ed" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="timestamp" type="number" scale="time" domain={[start, timestamp]} ticks={[0, 1, 2, 3, 4].map(n => start + n * hours * 900)} tickFormatter={value => new Date(value * 1000).toLocaleString('zh-CN', hours > 24 ? { month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false })} axisLine={false} tickLine={false} tick={{ fill: '#8b9491', fontSize: 10 }} tickMargin={12} />
          <YAxis domain={mode === 'successRate' ? [0, 100] : [0, (max: number) => Math.max(1, Math.ceil(max * 1.25))]} axisLine={false} tickLine={false} tick={{ fill: '#707a73', fontSize: 10 }} tickFormatter={value => `${value}`} tickCount={5} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><span>{time(Number(label), true)}</span><strong>{selected.label}　{fmt(Number(payload[0].value), 2)} {selected.unit}</strong></div> : null} />
          <Line type="linear" dataKey="value" stroke={selected.color} strokeWidth={2} connectNulls={false} dot={{ r: 5, fill: selected.color, stroke: '#ffffff', strokeWidth: 3 }} activeDot={{ r: 7, stroke: '#ffffff', strokeWidth: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>}
    </div>
    <div className="panel-note"><Info size={13} /><span>{validPoints.length === 1 ? '当前仅有 1 个采样点，积累更多记录后将显示趋势。' : `按接口实际采样展示${validPoints.length ? ` · ${validPoints.length} 个有效采样点` : ''}`}</span></div>
  </section>;
}

function App() {
  const [hours, setHours] = useState(24);
  const [automatic, setAutomatic] = useState(true);
  const [accountsRefreshKey, setAccountsRefreshKey] = useState(0);
  const { data, loading, error, refresh } = useStatus(hours, automatic);
  const [groupName, setGroupName] = useState('default');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [activeLog, setActiveLog] = useState<Log | null>(null);
  const group = data?.metrics.data?.groups.find(item => item.name === groupName) ?? data?.metrics.data?.groups[0];
  const timestamp = data ? new Date(data.fetchedAt).getTime() / 1000 : Date.now() / 1000;
  const logs = useMemo(() => (data?.logs.data ?? []).filter(log => log.model === data?.model && (!group || log.group === group.name) && log.createdAt !== null && log.createdAt >= timestamp - hours * 3600 && log.createdAt <= timestamp), [data, group, hours, timestamp]);
  const filteredLogs = useMemo(() => logs.filter(log => (filter === 'all' || log.status === filter) && `${log.id} ${log.model} ${log.upstreamModel}`.toLowerCase().includes(search.toLowerCase().trim())), [logs, filter, search]);
  const pages = Math.max(1, Math.ceil(filteredLogs.length / 8));
  const safePage = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [hours, search, filter, groupName]);
  const hasMetrics = !!group && group.series.length > 0 && group.successRate !== null;
  const allUnavailable = !!error || (!!data && !!data.logs.error && !!data.metrics.error);
  const degraded = !allUnavailable && (!!data?.logs.error || !!data?.metrics.error || (hasMetrics && group!.successRate! < 99));
  const healthy = hasMetrics && !allUnavailable && !degraded;
  const stateLabel = loading && !data ? '正在连接' : allUnavailable ? '连接异常' : degraded ? '部分异常' : healthy ? '运行正常' : '等待数据';
  const logAvailable = data?.logs.data != null;
  const totalTokens = logAvailable ? logs.reduce((total, log) => total + (log.promptTokens ?? 0) + (log.completionTokens ?? 0), 0) : null;
  const hasMissingTokens = logs.some(log => log.promptTokens === null || log.completionTokens === null);
  const totalInput = logs.reduce((total, log) => total + (log.promptTokens ?? 0), 0);
  const totalOutput = logs.reduce((total, log) => total + (log.completionTokens ?? 0), 0);
  const warnings = [error, data?.metrics.error, data?.logs.error].filter(Boolean);
  const metrics: { label: string; key?: keyof Metric; value: number | null; unit: string; digits: number; icon: typeof Activity; note: string; color: string }[] = [
    { label: '请求成功率', value: group?.successRate ?? null, unit: '%', digits: 1, icon: CircleCheck, note: '所选时段 · 模型分组统计', color: 'green' },
    { label: '平均响应耗时', value: group?.latencyMs == null ? null : group.latencyMs / 1000, unit: 's', digits: 2, icon: Timer, note: '从发出请求到完成响应', color: 'blue' },
    { label: '平均生成速度', value: group?.tokensPerSecond ?? null, unit: 'tok/s', digits: 2, icon: Zap, note: '每秒生成的 Token 数', color: 'amber' },
    { label: 'Token 用量', value: totalTokens, unit: '', digits: 0, icon: Layers, note: `${hasMissingTokens ? '部分用量缺失 · ' : ''}当前返回的 ${logs.length} 条时段内请求`, color: 'violet' },
  ];

  return <>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#overview" aria-label="香菜状态页首页"><span className="brand-symbol"><LeafMark size={25} /></span><strong>香菜</strong><span className="brand-divider" /><span className="brand-caption">运行状态</span></a>
      <nav aria-label="页面导航"><a href="#overview" className="nav-overview">概览</a><a href="#accounts">账号状态</a><a href="#requests">请求日志 <ArrowUpRight size={13} /></a></nav>
      <span className={`header-status ${healthy ? '' : 'muted'}`}><span className={`status-dot ${healthy ? 'live' : ''}`} />{stateLabel}</span>
    </div></header>

    <main className="page-shell" id="overview">
      <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><div className="eyebrow"><span className="tiny-leaf"><LeafMark size={16} /></span> XIANGCAI / LIVE STATUS</div><h1 id="hero-title">香菜，{allUnavailable ? '正在等待重连。' : degraded ? '有一点小波动。' : healthy ? '正在好好回应。' : '准备好回应。'}</h1><p>一棵香菜的工作日常。<span>在这里，看看每一次 AI 回应的状态。</span></p><div className="hero-meta"><span className={`health-badge ${healthy ? '' : 'neutral'}`}><span className="status-dot" />{healthy ? '模型服务正常' : stateLabel}</span><span className="hero-model"><Server size={13} />模型 <b className="mono">{data?.model ?? 'xc'}</b></span></div></div><BotIllustration /></section>

      <div className="overview-toolbar"><div className="section-label"><span className="section-square" /><h2>运行概览</h2><span>每 30 秒更新</span></div><div className="toolbar-controls"><button className={`auto-button ${automatic ? 'enabled' : ''}`} onClick={() => setAutomatic(value => !value)} aria-pressed={automatic} title={automatic ? '暂停自动刷新' : '开启自动刷新'}>{automatic ? <Pause size={12} /> : <Play size={12} />}<span>{automatic ? '实时刷新中' : '已暂停刷新'}</span></button><div className="select-wrap"><Clock3 size={14} /><select aria-label="统计时间范围" value={hours} onChange={event => setHours(Number(event.target.value))}>{rangeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={13} /></div><button className="icon-button refresh-button" aria-label="立即刷新" title="立即刷新" onClick={() => { void refresh(); setAccountsRefreshKey(value => value + 1); }} disabled={loading}><RefreshCw size={15} className={loading ? 'spinning' : ''} /></button></div></div>

      {warnings.length > 0 && <div className="warning-banner" role="alert"><Info size={18} /><div><strong>{allUnavailable ? '暂时无法更新状态' : '部分数据暂时不可用'}</strong><p>{[...new Set(warnings)].join(' ')}{error && data ? ' 当前保留上次成功获取的数据。' : ''}</p></div><button onClick={() => void refresh()} disabled={loading}>重新连接</button></div>}

      <section className={`stats-grid ${loading && !data ? 'is-loading' : ''}`} aria-label="核心运行指标">{metrics.map(item => <article className="stat-card" key={item.label}><div className="stat-top"><span>{item.label}</span><span className={`stat-icon ${item.color}`}><item.icon size={17} strokeWidth={1.7} /></span></div><div className="stat-value mono">{fmt(item.value, item.digits)}<span>{item.unit}</span></div><div className="stat-bottom">{item.label === '请求成功率' && healthy ? <span className="small-dot" /> : null}{item.note}</div></article>)}</section>

      <div className="middle-grid"><PerformanceChart group={group} hours={hours} timestamp={timestamp} error={data?.metrics.error ?? error} loading={loading} />
        <section className="panel model-panel" aria-labelledby="model-title"><div className="panel-heading"><h2 id="model-title">当前模型</h2><span className="mini-caption">MODEL</span></div><div className="model-identity"><span className="model-avatar"><LeafMark size={29} /></span><div><strong className="mono">{data?.model ?? 'xc'}</strong><span>香菜的思考引擎</span></div><span className={`model-state ${healthy ? '' : 'neutral'}`}><span className="status-dot" />{healthy ? '可用' : '待确认'}</span></div>
          <dl className="model-facts"><div><dt><Database size={14} />服务分组</dt><dd>{(data?.metrics.data?.groups.length ?? 0) > 1 ? <select aria-label="模型分组" value={group?.name} onChange={event => setGroupName(event.target.value)}>{data?.metrics.data?.groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select> : <span className="code-chip">{group?.name ?? '—'}</span>}</dd></div><div><dt><Timer size={14} />平均首字耗时</dt><dd className="mono">{group?.ttftMs == null ? <span className="subtle">未测得</span> : `${fmt(group.ttftMs)} ms`}</dd></div><div><dt><Signal size={14} />有效采样</dt><dd><b className="mono">{group ? fmt(group.series.filter(point => point.timestamp >= timestamp - hours * 3600 && point.timestamp <= timestamp).length) : '—'}</b><span className="subtle"> 个</span></dd></div></dl>
          <div className="token-breakdown"><div className="token-breakdown-heading"><span>请求 Token 分布</span><span>当前记录</span></div><div className="token-bar" aria-label={`输入 ${number.format(totalInput)}，输出 ${number.format(totalOutput)} Token`}>{totalInput + totalOutput > 0 && <><span style={{ flex: totalInput }} /><span style={{ flex: totalOutput, minWidth: totalOutput > 0 ? 3 : 0 }} /></>}</div><div className="token-labels"><span><i className="input-dot" />输入 <b className="mono">{logAvailable ? fmt(totalInput) : '—'}</b></span><span><i className="output-dot" />输出 <b className="mono">{logAvailable ? fmt(totalOutput) : '—'}</b></span></div></div>
        </section>
      </div>

      <AccountsPanel automatic={automatic} refreshKey={accountsRefreshKey} />

      <section className="panel logs-panel" id="requests" aria-labelledby="logs-title"><div className="logs-heading"><div className="logs-title"><h2 id="logs-title">AI 请求日志</h2><span className="count-badge">{logAvailable ? logs.length : '—'}</span><span className="logs-subtitle">回应的足迹，都在这里</span></div><div className="log-filters"><label className="search-field"><Search size={15} /><input aria-label="搜索模型或记录编号" placeholder="搜索模型或记录编号…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="清除搜索" onClick={() => setSearch('')}><X size={13} /></button>}</label><div className="select-wrap status-filter"><select aria-label="筛选请求状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option><option value="success">成功</option><option value="error">失败</option></select><ChevronDown size={13} /></div></div></div>
        <div className="table-scroll"><table><thead><tr><th>请求时间 <span className="sort-arrow">↓</span></th><th>模型</th><th>状态</th><th className="numeric">输入 / 输出 Token</th><th className="numeric">耗时</th><th>响应方式</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>
          {loading && !data ? Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden="true">{Array.from({ length: 7 }, (_, cell) => <td key={cell}><span className="skeleton" /></td>)}</tr>) : filteredLogs.slice((safePage - 1) * 8, safePage * 8).map(log => <tr key={log.id}><td><div className="time-cell"><span className="mono">{time(log.createdAt)}</span><span>{log.createdAt ? new Date(log.createdAt * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—'}<i>·</i><span className="mono">#{log.id}</span></span></div></td><td><div className="model-cell"><span className="table-model mono">{log.model}</span><span title={log.upstreamModel}>{log.upstreamModel || '未提供实际模型'}</span></div></td><td><StatusPill success={log.status === 'success'} /></td><td className="numeric"><div className="token-cell mono"><span title="输入 Token"><ArrowDownLeft size={12} />{fmt(log.promptTokens)}</span><span className="token-separator">/</span><span title="输出 Token"><ArrowUpRight size={12} />{fmt(log.completionTokens)}</span></div></td><td className="numeric mono duration-cell">{fmt(log.durationSeconds, 1)}<span> s</span></td><td><span className="response-mode"><span className={log.streaming ? 'mode-dot streaming' : 'mode-dot'} />{log.streaming ? '流式' : '非流式'}</span></td><td><button className="row-detail" onClick={() => setActiveLog(log)} aria-label={`查看请求 ${log.id} 的详情`}><ChevronRight size={17} /></button></td></tr>)}
        </tbody></table></div>
        {!(loading && !data) && filteredLogs.length === 0 && <div className="logs-empty"><Search size={26} /><strong>{data?.logs.error || error ? '暂时无法读取请求日志' : search || filter !== 'all' ? '没有找到匹配的请求' : '这个时段还没有请求记录'}</strong><span>{data?.logs.error || error ? '稍后刷新即可重试' : search || filter !== 'all' ? '试试其他关键词，或清除筛选条件' : '香菜的下一次回应，会在这里留下记录'}</span>{(search || filter !== 'all') && <button className="button" onClick={() => { setSearch(''); setFilter('all'); }}>清除筛选</button>}</div>}
        <div className="logs-footer"><span>{logAvailable ? `显示 ${filteredLogs.length ? (safePage - 1) * 8 + 1 : 0}–${Math.min(safePage * 8, filteredLogs.length)} 条，共 ${filteredLogs.length} 条` : '等待请求记录'}<span className="footer-divider">·</span><span className="sample-note">仅统计接口返回的时段内记录</span></span><div className="pagination"><button aria-label="上一页" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={15} /></button><span className="mono">{safePage} <span>/ {pages}</span></span><button aria-label="下一页" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><ChevronRight size={15} /></button></div></div>
      </section>

      <footer className="site-footer"><div><LeafMark size={17} /><span>香菜的小小观测站</span><span className="footer-divider">/</span><span>状态依据模型请求统计</span></div><span className="last-updated" role="status"><CheckCheck size={14} />{data ? `最近同步 ${new Date(data.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : loading ? '正在同步数据…' : '尚未同步'}<a href="#overview" aria-label="回到顶部"><ExternalLink size={13} /></a></span></footer>
    </main>
    <LogDetail log={activeLog} close={() => setActiveLog(null)} />
  </>;
}

export default App;
