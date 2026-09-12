import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import PageLayout from '../../components/layout/PageLayout';
import PageIntro from '../../components/layout/PageIntro';
import StatusToolbar from '../../components/status/StatusToolbar';
import StatusWarning from '../../components/status/StatusWarning';
import { useStatus } from '../../state/StatusContext';
import { fmt, time } from '../../lib/format';
import type { Log } from '../../types';
import LogDetail, { StatusPill } from './LogDetail';
import './requests.css';

// 每页行数选项；默认 8 行与原有行为一致。
const PAGE_SIZES = [8, 15, 30, 50];

export default function RequestsPage() {
  const { hours, data, loading, error, groupName, logs, healthy, stateLabel } = useStatus();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [activeLog, setActiveLog] = useState<Log | null>(null);
  const filteredLogs = useMemo(() => logs.filter(log => (filter === 'all' || log.status === filter) && `${log.id} ${log.model} ${log.upstreamModel}`.toLowerCase().includes(search.toLowerCase().trim())), [logs, filter, search]);
  const pages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, pages);
  // 切换筛选或每页行数时回到第一页，避免停留在越界的页码上。
  useEffect(() => { setPage(1); }, [hours, search, filter, groupName, pageSize]);
  const logAvailable = data?.logs.data != null;

  return <PageLayout title="请求日志" healthy={healthy} stateLabel={stateLabel} fetchedAt={data?.fetchedAt} loading={loading}>
    <PageIntro eyebrow="XIANGCAI / REQUEST LOGS" title="请求日志" description="每一次回应，都有迹可循。按时间、分组和状态，找到你关心的请求。" />
    <StatusToolbar title="请求记录" showGroup />
    <StatusWarning />
      <section className="panel logs-panel" id="requests" aria-labelledby="logs-title"><div className="logs-heading"><div className="logs-title"><h2 id="logs-title">AI 请求日志</h2><span className="count-badge">{logAvailable ? logs.length : '—'}</span><span className="logs-subtitle">回应的足迹，都在这里</span></div><div className="log-filters"><label className="search-field"><Search size={15} /><input aria-label="搜索模型或记录编号" placeholder="搜索模型或记录编号…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="清除搜索" onClick={() => setSearch('')}><X size={13} /></button>}</label><div className="select-wrap status-filter"><select aria-label="筛选请求状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option><option value="success">成功</option><option value="error">失败</option></select><ChevronDown size={13} /></div><div className="select-wrap status-filter page-size-filter"><select aria-label="每页显示行数" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>每页 {size} 行</option>)}</select><ChevronDown size={13} /></div></div></div>
        <div className="table-scroll"><table><thead><tr><th>请求时间 <span className="sort-arrow">↓</span></th><th>模型</th><th>状态</th><th className="numeric">输入 / 输出 Token</th><th className="numeric">耗时</th><th>响应方式</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>
          {loading && !data ? Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden="true">{Array.from({ length: 7 }, (_, cell) => <td key={cell}><span className="skeleton" /></td>)}</tr>) : filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize).map(log => <tr key={log.id}><td><div className="time-cell"><span className="mono">{time(log.createdAt)}</span><span>{log.createdAt ? new Date(log.createdAt * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—'}<i>·</i><span className="mono">#{log.id}</span></span></div></td><td><div className="model-cell"><span className="table-model mono">{log.model}</span><span title={log.upstreamModel}>{log.upstreamModel || '未提供实际模型'}</span></div></td><td><StatusPill success={log.status === 'success'} /></td><td className="numeric"><div className="token-cell mono"><span title="输入 Token"><ArrowDownLeft size={12} />{fmt(log.promptTokens)}</span><span className="token-separator">/</span><span title="输出 Token"><ArrowUpRight size={12} />{fmt(log.completionTokens)}</span></div></td><td className="numeric mono duration-cell">{fmt(log.durationSeconds, 1)}<span> s</span></td><td><span className="response-mode"><span className={log.streaming ? 'mode-dot streaming' : 'mode-dot'} />{log.streaming ? '流式' : '非流式'}</span></td><td><button className="row-detail" onClick={() => setActiveLog(log)} aria-label={`查看请求 ${log.id} 的详情`}><ChevronRight size={17} /></button></td></tr>)}
        </tbody></table></div>
        {!(loading && !data) && filteredLogs.length === 0 && <div className="logs-empty"><Search size={26} /><strong>{data?.logs.error || error ? '暂时无法读取请求日志' : search || filter !== 'all' ? '没有找到匹配的请求' : '这个时段还没有请求记录'}</strong><span>{data?.logs.error || error ? '稍后刷新即可重试' : search || filter !== 'all' ? '试试其他关键词，或清除筛选条件' : '香菜的下一次回应，会在这里留下记录'}</span>{(search || filter !== 'all') && <button className="button" onClick={() => { setSearch(''); setFilter('all'); }}>清除筛选</button>}</div>}
        <div className="logs-footer"><span>{logAvailable ? `显示 ${filteredLogs.length ? (safePage - 1) * pageSize + 1 : 0}–${Math.min(safePage * pageSize, filteredLogs.length)} 条，共 ${filteredLogs.length} 条` : '等待请求记录'}<span className="footer-divider">·</span><span className="sample-note">仅统计接口返回的时段内记录</span></span><div className="pagination"><button aria-label="上一页" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={15} /></button><span className="mono">{safePage} <span>/ {pages}</span></span><button aria-label="下一页" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><ChevronRight size={15} /></button></div></div>
      </section>

    <LogDetail log={activeLog} close={() => setActiveLog(null)} />
  </PageLayout>;
}
