import { useState } from 'react';
import { BarChart3, CheckCheck, CircleCheck, Clock3, Info, Layers, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageLayout from '../../components/layout/PageLayout';
import PageIntro from '../../components/layout/PageIntro';
import RefreshControls from '../../components/status/RefreshControls';
import { fmt } from '../../lib/format';
import { useStatus } from '../../state/StatusContext';
import GroupParsePanel from './GroupParsePanel';
import PlatformList from './PlatformList';
import PlatformMediaPanel from './PlatformMediaPanel';
import TopGroupsPanel from './TopGroupsPanel';
import { colors, mediaMetricsOf } from './parseMetrics';
import useParseStats from './useParseStats';
import './statistics.css';

export default function StatisticsPage() {
  const { automatic, setAutomatic } = useStatus();
  const { snapshot, error, loading, refresh } = useParseStats(automatic);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<'count' | 'mediaSeconds'>('count');
  const data = snapshot?.data;
  const issue = error ?? snapshot?.error;
  const ready = !!data && !issue;
  const stateLabel = loading && !snapshot ? '正在连接' : issue ? '连接异常' : !snapshot?.configured ? '等待接入' : ready ? '同步正常' : '等待数据';
  const history = data?.history.slice(-days) ?? [];
  const periodTotal = history.length && history.every(day => day.count !== null) ? history.reduce((sum, day) => sum + day.count!, 0) : null;
  const charts = history.map(day => ({ ...day, value: mode === 'count' ? day.count : day.mediaSeconds === null ? null : day.mediaSeconds / 3600 }));
  const metrics = [
    { label: '累计成功解析', value: data?.totalParses, unit: '次', icon: CheckCheck },
    { label: `最近 ${days} 天成功解析`, value: periodTotal, unit: '次', icon: BarChart3 },
    { label: '累计参与用户', value: data?.totalUsers, unit: '人', icon: Users },
    { label: '参与群数', value: data?.totalGroups, unit: '个', icon: Layers },
    { label: '解析成功率', value: data?.media.successRate, unit: '%', icon: CircleCheck, digits: 2 },
  ];

  return <PageLayout title="解析统计" healthy={ready} stateLabel={stateLabel} fetchedAt={snapshot?.fetchedAt} loading={loading} note="统计来源：R 插件解析记录">
    <PageIntro eyebrow="XIANGCAI / PARSE STATISTICS" title="解析统计" description="链接解析与媒体处理的累计记录" />
    <div className="overview-toolbar">
      <div className="section-label"><span className="section-square" /><h2>全局统计</h2><span><ShieldCheck size={13} />匿名汇总</span></div>
      <RefreshControls automatic={automatic} setAutomatic={setAutomatic} loading={loading} refresh={refresh} refreshLabel="刷新解析统计" />
    </div>
    {issue && <div className="warning-banner" role="alert"><Info size={18} /><div><strong>解析统计暂时不可用</strong><p>{issue}{snapshot?.retryAt ? ` 下次可重试时间：${new Date(snapshot.retryAt).toLocaleTimeString('zh-CN', { hour12: false })}` : ''}</p></div><button onClick={() => void refresh()} disabled={loading}>重试</button></div>}
    {!ready ? <div className="statistics-empty" role="status">{loading ? <RefreshCw className="spinning" size={25} /> : <BarChart3 size={25} />}<strong>{loading ? '正在读取解析统计…' : issue ? '等待恢复连接' : '解析统计尚未接入'}</strong>{!loading && !issue && <span>等待管理员完成统计服务配置</span>}</div> : <>
      <dl className="statistics-totals">{metrics.map(({ label, value, unit, icon: Icon, digits }, index) => <div key={label}>
        <dt><Icon size={17} style={{ color: colors[index] }} />{label}</dt><dd><strong className="mono">{fmt(value, digits)}</strong><span>{unit}</span></dd>
      </div>)}</dl>
      <div className="statistics-columns">
        <section className="statistics-section" aria-labelledby="parse-history-title">
          <div className="statistics-heading"><h2 id="parse-history-title">解析趋势</h2><div className="statistics-segments" aria-label="统计天数">{[7, 30].map(value => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</button>)}</div></div>
          <div className="statistics-chart-controls"><div className="statistics-segments" aria-label="趋势指标"><button aria-pressed={mode === 'count'} onClick={() => setMode('count')}>成功解析</button><button aria-pressed={mode === 'mediaSeconds'} onClick={() => setMode('mediaSeconds')}>媒体时长</button></div><span>{mode === 'count' ? '单位：次' : '单位：小时'}</span></div>
          {charts.length ? <div className="statistics-chart" role="img" aria-label={`最近 ${history.length} 天${mode === 'count' ? '成功解析次数' : '媒体时长'}趋势`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={charts} margin={{ top: 15, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e9edeb" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#707a73' }} minTickGap={25} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#707a73' }} width={45} allowDecimals={mode !== 'count'} />
            <Tooltip cursor={{ fill: '#edf0f2' }} content={({ active, payload, label }) => active && payload?.length ? <div className="statistics-tooltip"><span>{label}</span><strong>{fmt(Number(payload[0].value), mode === 'count' ? 0 : 2)} {mode === 'count' ? '次' : '小时'}</strong></div> : null} />
            <Bar dataKey="value" fill={mode === 'count' ? '#61834c' : '#5b86a6'} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          </BarChart></ResponsiveContainer></div> : <div className="statistics-empty">暂无趋势记录</div>}
          <p className="statistics-caption">日期按机器人服务器本地时区统计</p>
        </section>
        <section className="statistics-section" aria-labelledby="parse-platforms-title">
          <div className="statistics-heading"><h2 id="parse-platforms-title">平台分布</h2><span>累计成功解析</span></div>
          <PlatformList platforms={data.platforms} />
        </section>
      </div>
      <div className="statistics-columns">
        <TopGroupsPanel groups={data.topGroups} />
        <PlatformMediaPanel rows={data.platformMedia} trendSeconds={data.mediaTrendSeconds} />
      </div>
      <section className="statistics-section statistics-media" aria-labelledby="parse-media-title">
        <div className="statistics-heading"><h2 id="parse-media-title"><Clock3 size={17} />媒体与处理</h2><span>成功 {fmt(data.media.successCount)} 次 · 失败 {fmt(data.media.failureCount)} 次</span></div>
        <dl>{mediaMetricsOf(data.media).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未测得'}</dd></div>)}</dl>
        <p className="statistics-caption">时长样本 {fmt(data.media.durationSamples)} 条 · 大小样本 {fmt(data.media.sizeSamples)} 条。媒体与成败统计自启用后累计，不回填旧记录；跳过的解析不计入成功率。</p>
      </section>
    </>}
    {snapshot?.configured && <GroupParsePanel />}
  </PageLayout>;
}
