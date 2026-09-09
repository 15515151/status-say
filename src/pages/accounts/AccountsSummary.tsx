import { ArrowDownLeft, ArrowUpRight, Info, Users } from 'lucide-react';
import { fmt } from '../../lib/format';
import type { BotAccount } from '../../types';
import { summarizeAccounts } from './summarizeAccounts';

export default function AccountsSummary({ accounts }: { accounts: BotAccount[] | null }) {
  const summary = accounts ? summarizeAccounts(accounts) : null;
  const metrics = [
    { label: '发送消息总数', total: summary?.sent, unit: '条', icon: ArrowUpRight },
    { label: '接收消息总数', total: summary?.received, unit: '条', icon: ArrowDownLeft },
    { label: '好友总数', total: summary?.friends, unit: '人次', icon: Users },
  ];

  return <section className="panel accounts-summary" aria-labelledby="accounts-summary-title">
    <div className="accounts-summary-heading">
      <h2 id="accounts-summary-title">账号汇总</h2>
      <span>{summary ? `${fmt(summary.count)} 个账号参与统计 · ` : ''}不含 QQBot 沙盒</span>
    </div>
    <dl className="accounts-totals">
      {metrics.map(({ label, total, unit, icon: Icon }) => <div className="accounts-total" key={label}>
        <dt><Icon size={16} />{label}</dt>
        <dd><strong className="mono">{fmt(total?.value)}</strong><span>{unit}</span></dd>
        {!!total?.missing && <p className="accounts-total-note">{total.value === null ? '暂无有效数据' : '仅合计已知数据'} · {fmt(total.missing)} 个账号未提供</p>}
      </div>)}
    </dl>
    <div className="accounts-summary-note"><Info size={15} /><p>部分账号同时在同一个群，收发消息可能重复统计，导致数据虚高。好友总数按账号累加，未去重。</p></div>
  </section>;
}
