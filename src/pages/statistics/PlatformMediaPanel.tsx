import { Clapperboard } from 'lucide-react';
import { durationText } from '../../lib/format';
import { colors } from './parseMetrics';
import type { ParsePlatformMedia } from './types';

// 平台媒体时长排行：视频 / 音频分列，按合计时长降序。
export default function PlatformMediaPanel({ rows, trendSeconds }: { rows: ParsePlatformMedia[]; trendSeconds: number | null }) {
  const max = Math.max(1, ...rows.map(row => row.totalSeconds));
  return <section className="statistics-section" aria-labelledby="parse-platform-media-title">
    <div className="statistics-heading">
      <h2 id="parse-platform-media-title"><Clapperboard size={17} />平台媒体时长</h2>
      <span>近 30 天合计 {durationText(trendSeconds)}</span>
    </div>
    {rows.length ? <ol className="statistics-media-rank">
      {rows.map((row, index) => <li key={row.name}>
        <div><span>{row.name}</span><strong className="mono">{durationText(row.totalSeconds)}</strong></div>
        <div className="statistics-platform-track" aria-hidden="true"><span style={{ width: `${row.totalSeconds / max * 100}%`, background: colors[index % colors.length] }} /></div>
        <div className="statistics-media-rank-split">
          <span>视频 {durationText(row.videoSeconds)}</span>
          <span>音频 {durationText(row.audioSeconds)}</span>
        </div>
      </li>)}
    </ol> : <div className="statistics-empty">暂无平台时长记录</div>}
  </section>;
}
