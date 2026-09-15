import type { ServerMetricPoint } from '../../types';

type Props = {
  points: ServerMetricPoint[];
  label: string;
  tone: 'green' | 'blue' | 'amber';
};

const width = 150;
const height = 38;
const padding = 3;

export default function ServerSparkline({ points, label, tone }: Props) {
  const values = points.map(point => point.value).filter(value => Number.isFinite(value));
  if (values.length < 2) return <span className="server-sparkline-empty">暂无采样</span>;
  const line = values.map((value, index) => {
    const x = padding + (width - padding * 2) * index / (values.length - 1);
    const y = height - padding - (height - padding * 2) * Math.min(100, Math.max(0, value)) / 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return <svg className={`server-sparkline ${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}近一小时趋势`}>
    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="server-sparkline-baseline" />
    <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" />
  </svg>;
}
