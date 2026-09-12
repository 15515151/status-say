import { useState } from 'react';
import { Clock3, Hash, Info, Search, Trophy, Users, X } from 'lucide-react';
import { fmt } from '../../lib/format';
import useGroupParseStats from './useGroupParseStats';
import PlatformList from './PlatformList';
import { colors, mediaMetricsOf } from './parseMetrics';

// 按群查询面板：群号只用于发起查询，界面只展示服务端回传的掩码群号。
export default function GroupParsePanel() {
  const [input, setInput] = useState('');
  const { snapshot, error, loading, lookup, clear } = useGroupParseStats();
  const data = snapshot?.data;
  const issue = error ?? snapshot?.error;
  // 该群占全局累计解析的比例，两者都有效时才计算。
  const share = data?.globalTotal ? data.totalParses / data.globalTotal * 100 : null;

  return <section className="statistics-section statistics-group" aria-labelledby="parse-group-title">
    <div className="statistics-heading">
      <h2 id="parse-group-title"><Hash size={17} />按群查询</h2>
      <span>群号仅用于查询，展示时自动脱敏</span>
    </div>
    <form className="statistics-group-form" onSubmit={event => { event.preventDefault(); void lookup(input); }}>
      <label htmlFor="parse-group-input">群号</label>
      <input id="parse-group-input" name="group_id" inputMode="numeric" autoComplete="off" placeholder="请输入群号"
        value={input} onChange={event => setInput(event.target.value.replace(/\D/g, ''))} maxLength={20} />
      <button type="submit" disabled={loading || !input.trim()}>
        <Search size={14} />{loading ? '查询中…' : '查询'}
      </button>
      {(snapshot || error) && <button type="button" className="statistics-group-clear" onClick={() => { setInput(''); clear(); }}>
        <X size={14} />清空
      </button>}
    </form>

    {!snapshot && !issue && !loading && <p className="statistics-caption">输入群号即可查看该群的解析统计。群号不会出现在页面地址或返回内容中，展示时会自动脱敏。</p>}

    {issue && <div className="statistics-group-note" role="alert"><Info size={15} /><span>{issue}</span></div>}

    {snapshot && !issue && !data && <div className="statistics-group-note" role="status"><Info size={15} /><span>未找到该群的解析记录。</span></div>}

    {data && <>
      <dl className="statistics-totals statistics-group-totals">
        <div>
          <dt><Hash size={17} style={{ color: colors[0] }} />群号</dt>
          <dd><strong className="mono">{data.groupId}</strong><span>已脱敏</span></dd>
        </div>
        <div>
          <dt><Users size={17} style={{ color: colors[1] }} />参与用户</dt>
          <dd><strong className="mono">{fmt(data.totalUsers)}</strong><span>人</span></dd>
        </div>
        <div>
          <dt><Clock3 size={17} style={{ color: colors[2] }} />累计成功解析</dt>
          <dd><strong className="mono">{fmt(data.totalParses)}</strong><span>次</span></dd>
        </div>
        <div>
          <dt><Trophy size={17} style={{ color: colors[3] }} />群排行</dt>
          <dd><strong className="mono">{data.groupRank === null ? '—' : `第 ${fmt(data.groupRank)}`}</strong><span>名</span></dd>
        </div>
        <div>
          <dt><Hash size={17} style={{ color: colors[0] }} />占全局</dt>
          <dd><strong className="mono">{share === null ? '—' : fmt(share, 1)}</strong><span>%</span></dd>
        </div>
      </dl>
      <div className="statistics-columns">
        <section className="statistics-section">
          <div className="statistics-heading"><h2>全局对照</h2><span>本站累计</span></div>
          <dl className="statistics-group-compare">
            <div><dt>全局成功解析</dt><dd>{fmt(data.globalTotal)} 次</dd></div>
            <div><dt>参与群数</dt><dd>{fmt(data.globalGroups)} 个</dd></div>
            <div><dt>本群成功解析</dt><dd>{fmt(data.totalParses)} 次</dd></div>
          </dl>
          <p className="statistics-caption">群排行与全局数据来自上游统计，用于说明该群在整体中的位置。</p>
        </section>
        <section className="statistics-section">
          <div className="statistics-heading"><h2>平台分布</h2><span>该群累计成功解析</span></div>
          <PlatformList platforms={data.platforms} />
        </section>
      </div>
      <section className="statistics-section statistics-media">
        <div className="statistics-heading"><h2><Clock3 size={17} />媒体与处理</h2><span>成功 {fmt(data.media.successCount)} 次 · 失败 {fmt(data.media.failureCount)} 次</span></div>
        <dl>{mediaMetricsOf(data.media).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未测得'}</dd></div>)}</dl>
        <p className="statistics-caption">本页只展示经过筛选的聚合值；群名、群头像、群成员账号、昵称与上游用户排行都不会返回。</p>
      </section>
    </>}
  </section>;
}
