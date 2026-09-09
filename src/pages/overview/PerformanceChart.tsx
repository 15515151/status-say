import { useState } from 'react';
import { Activity, Info, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt, time, rangeOptions } from '../../lib/format';
import type { Group } from '../../types';

type ChartKey = 'latencyMs' | 'tokensPerSecond' | 'successRate';
const chartModes: { key: ChartKey; label: string; unit: string; color: string }[] = [
  { key: 'latencyMs', label: '响应耗时', unit: 's', color: '#61834c' },
  { key: 'tokensPerSecond', label: '生成速度', unit: 'tok/s', color: '#5b86a6' },
  { key: 'successRate', label: '成功率', unit: '%', color: '#61834c' },
];

export default function PerformanceChart({ group, hours, timestamp, error, loading }: { group?: Group; hours: number; timestamp: number; error?: string | null; loading: boolean }) {
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
