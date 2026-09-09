import { Bot, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Accounts } from '../../types';
import AccountCard from './AccountCard';

type Props = { automatic: boolean; snapshot: Accounts | null; error: string | null; loading: boolean };

export default function AccountsPanel({ automatic, snapshot, error, loading }: Props) {
  const issue = error ?? snapshot?.error;
  const accounts = snapshot?.data?.list ?? [];
  return <section className="panel accounts-panel" id="accounts" aria-labelledby="accounts-title">
    <div className="accounts-heading"><div><div className="accounts-title"><Bot size={18} /><h2 id="accounts-title">账号状态</h2>{snapshot?.data && <span className="count-badge">{snapshot.data.total}</span>}</div><p>香菜的连接状态与消息日常</p></div><div className="accounts-actions"><span className="account-privacy"><ShieldCheck size={13} />账号已脱敏</span></div></div>
    {loading && !snapshot && !error ? <div className="accounts-empty" role="status"><RefreshCw className="spinning" size={22} /><span>正在读取账号状态…</span></div>
      : issue ? <div className="accounts-empty account-issue" role="status"><Info size={23} /><strong>账号状态暂时不可用</strong><span>{issue}</span>{snapshot?.retryAt && <small>下次可重试时间：{new Date(snapshot.retryAt).toLocaleTimeString('zh-CN', { hour12: false })}{automatic ? ' · 将自动重试' : ' · 自动刷新已暂停'}</small>}</div>
      : !snapshot?.configured ? <div className="accounts-empty"><Bot size={25} /><strong>账号状态尚未接入</strong><span>等待管理员完成配置后，这里将显示香菜的账号信息。</span></div>
      : accounts.length === 0 ? <div className="accounts-empty"><Bot size={25} /><strong>暂未发现 Bot 账号</strong><span>账号连接后，运行状态会显示在这里。</span></div>
      : <div className="accounts-grid">{accounts.map(account => <AccountCard key={account.id} account={account} />)}</div>}
    <div className="accounts-footer"><span>展示当前连接状态与累计消息数量</span><span>{snapshot?.fetchedAt ? `最近同步 ${new Date(snapshot.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待同步'}</span></div>
  </section>;
}
