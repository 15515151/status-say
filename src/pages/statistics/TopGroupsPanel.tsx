import { useMemo, useState } from 'react';
import { Trophy, Users } from 'lucide-react';
import { fmt } from '../../lib/format';
import type { ParseTopGroup } from './types';

type SortKey = 'count' | 'users';

// 群解析排行：只展示脱敏群号与聚合计数，群名与头像不参与展示。
export default function TopGroupsPanel({ groups }: { groups: ParseTopGroup[] }) {
  const [sort, setSort] = useState<SortKey>('count');
  // 人数可能缺失，缺失项排在末尾，避免与真实的 0 混淆。
  const sorted = useMemo(() => [...groups].sort((a, b) => {
    const left = sort === 'count' ? a.count : a.users;
    const right = sort === 'count' ? b.count : b.users;
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  }), [groups, sort]);
  const max = Math.max(1, ...sorted.map(group => (sort === 'count' ? group.count : group.users) ?? 0));

  return <section className="statistics-section" aria-labelledby="parse-topgroups-title">
    <div className="statistics-heading">
      <h2 id="parse-topgroups-title"><Trophy size={17} />群解析排行</h2>
      <div className="statistics-segments" aria-label="排行指标">
        <button aria-pressed={sort === 'count'} onClick={() => setSort('count')}>按次数</button>
        <button aria-pressed={sort === 'users'} onClick={() => setSort('users')}>按人数</button>
      </div>
    </div>
    {sorted.length ? <ol className="statistics-topgroups">
      {sorted.map((group, index) => {
        const value = (sort === 'count' ? group.count : group.users) ?? 0;
        return <li key={group.groupId}>
          <span className="statistics-topgroups-rank">{index + 1}</span>
          {/* 头像由本站代理转发，路径里只有不透明 ID，不含群号。 */}
          {group.avatarPath
            ? <img className="statistics-topgroups-avatar" src={group.avatarPath} alt="" width={30} height={30} loading="lazy" decoding="async" />
            : <span className="statistics-topgroups-avatar statistics-topgroups-avatar-empty" aria-hidden="true" />}
          <div>
            <div className="statistics-topgroups-head">
              <span className="mono">{group.groupId}</span>
              <strong className="mono">{fmt(group.count)} 次<small><Users size={10} />{fmt(group.users)}</small></strong>
            </div>
            <div className="statistics-platform-track" aria-hidden="true"><span style={{ width: `${value / max * 100}%`, background: index < 3 ? '#61834c' : '#5b86a6' }} /></div>
          </div>
        </li>;
      })}
    </ol> : <div className="statistics-empty">暂无群排行记录</div>}
    <p className="statistics-caption">群号已脱敏，群名与群头像不展示。按「次数」或「人数」排序可对比各群的解析规模；上游不提供按群时长，因此无法按时长排序。</p>
  </section>;
}
