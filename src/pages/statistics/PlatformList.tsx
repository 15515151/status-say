import { fmt } from '../../lib/format';
import { colors } from './parseMetrics';
import type { ParsePlatform } from './types';

// 平台分布列表，全局与按群统计共用。
export default function PlatformList({ platforms }: { platforms: ParsePlatform[] }) {
  const total = platforms.reduce((sum, platform) => sum + platform.count, 0);
  const max = Math.max(1, ...platforms.map(platform => platform.count));
  if (total <= 0) return <div className="statistics-empty">暂无平台记录</div>;
  return <ol className="statistics-platforms">
    {platforms.filter(platform => platform.count > 0).map((platform, index) => <li key={platform.name}>
      <div><span>{platform.name}</span><strong className="mono">{fmt(platform.count)}<small>{fmt(platform.count / total * 100, 1)}%</small></strong></div>
      <div className="statistics-platform-track" aria-hidden="true"><span style={{ width: `${platform.count / max * 100}%`, background: colors[index % colors.length] }} /></div>
    </li>)}
  </ol>;
}
