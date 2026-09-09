import { ChevronDown, Copy, Info, ListChecks, RefreshCw, Users } from 'lucide-react';
import { fmt } from '../../lib/format';
import type { GroupStats } from './groupStatsTypes';

type Props = { snapshot: GroupStats | null; error: string | null; loading: boolean; automatic: boolean };

export default function GroupStatsPanel({ snapshot, error, loading, automatic }: Props) {
  const issue = error ?? snapshot?.error;
  const data = !issue && snapshot?.configured ? snapshot.data : null;
  const incomplete = snapshot?.partial || !!data?.offlineBots;
  const metrics = [
    { label: '去重后群组', value: data?.uniqueGroups, unit: '个', icon: Users },
    { label: '群组累计', value: data?.totalGroups, unit: '个', icon: ListChecks },
    { label: '重复计数', value: data?.duplicateGroups, unit: '次', icon: Copy },
  ];
  const notices = data ? [
    snapshot?.partial ? '部分群列表读取失败，统计可能不完整。' : '',
    data.cachedBots ? `${fmt(data.cachedBots)} 个账号使用缓存，群数可能不是最新。` : '',
    data.offlineBots ? `${fmt(data.offlineBots)} 个离线账号未计入群数。` : '',
  ].filter(Boolean) : [];

  return <section className="panel group-stats-panel" aria-labelledby="group-stats-title" aria-busy={loading}>
    <div className="accounts-heading">
      <div><div className="accounts-title"><Users size={18} /><h2 id="group-stats-title">群组统计</h2></div><p>跨账号去重，查看香菜覆盖的群组</p></div>
      {data && <span className={`group-stats-state ${incomplete || data.cachedBots ? 'has-notice' : ''}`}><span className="status-dot" />{incomplete ? '统计不完整' : data.cachedBots ? '含缓存数据' : data.loadedBots ? '统计已更新' : '暂无可统计账号'}</span>}
    </div>
    {loading && !snapshot && !error ? <div className="accounts-empty" role="status"><RefreshCw className="spinning" size={22} /><span>正在读取群组统计…</span></div>
      : issue ? <div className="accounts-empty account-issue" role="status"><Info size={23} /><strong>群组统计暂时不可用</strong><span>{issue}</span>{snapshot?.retryAt && <small>下次可重试时间：{new Date(snapshot.retryAt).toLocaleTimeString('zh-CN', { hour12: false })}{automatic ? ' · 将自动重试' : ' · 自动刷新已暂停'}</small>}</div>
      : !data ? <div className="accounts-empty"><Users size={25} /><strong>群组统计尚未接入</strong><span>等待管理员完成统计服务配置。</span></div>
      : <>
        <dl className="accounts-totals group-stats-totals">
          {metrics.map(({ label, value, unit, icon: Icon }) => <div className="accounts-total" key={label}>
            <dt><Icon size={16} />{label}</dt><dd><strong className="mono">{fmt(value)}</strong><span>{unit}</span></dd>
          </div>)}
        </dl>
        <div className="group-stats-coverage"><span>已读取 <b className="mono">{fmt(data.loadedBots)}</b> 个账号</span><span>参与读取：OneBot <b className="mono">{fmt(data.oneBotCount)}</b> · ICQQ <b className="mono">{fmt(data.icqqCount)}</b></span>{data.skippedBots > 0 && <span>跳过其他适配器 {fmt(data.skippedBots)} 个</span>}</div>
        {notices.length > 0 && <div className="group-stats-notice" role="status"><Info size={15} /><p>{notices.join('')}</p></div>}
        {data.bots.length > 0 && <details className="group-stats-details">
          <summary><span>各账号群组明细 <span className="group-stats-detail-count">{fmt(data.bots.length)} 个账号</span></span><ChevronDown size={16} /></summary>
          <div className="group-stats-table-wrap" role="region" aria-label="各账号群组明细" tabIndex={0}>
            <table className="group-stats-table">
              <caption className="sr-only">账号群组数量及读取状态，账号已脱敏</caption>
              <thead><tr><th scope="col">账号</th><th scope="col">协议</th><th scope="col">群组数</th><th scope="col">新增覆盖群</th><th scope="col">读取状态</th></tr></thead>
              <tbody>{data.bots.map((bot, index) => {
                const unavailable = bot.status === '离线' || bot.status === '获取失败' || bot.status === '未知';
                return <tr key={`${bot.type}-${bot.botId}-${index}`}>
                  <th scope="row" className="mono">{bot.botId}</th><td>{bot.type}</td><td className="mono">{fmt(unavailable ? null : bot.groupCount)}</td><td className="mono">{fmt(unavailable ? null : bot.uniqueGroupCount)}</td><td><span className={`group-bot-status ${bot.status === '已读取' ? 'is-ready' : 'has-notice'}`}>{bot.status}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <p className="group-stats-caption">“新增覆盖群”按账号读取顺序去重，表示此前账号尚未覆盖的群数，并非该账号独有的群。</p>
        </details>}
        <div className="accounts-summary-note"><Info size={15} /><p>仅统计 OneBot / ICQQ 账号。群组累计按账号相加，同一群可能重复；去重后群组按群号只计一次；重复计数为两者之差。</p></div>
      </>}
    <div className="accounts-footer"><span>与账号状态一起刷新</span><span>{snapshot?.updatedAt ? `统计更新 ${new Date(snapshot.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : '等待同步'}</span></div>
  </section>;
}
