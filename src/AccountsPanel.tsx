import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bot, Clock3, Info, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { LeafMark } from './BotIllustration';
import type { Accounts, BotAccount } from './types';

const number = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN');

function AccountCard({ account }: { account: BotAccount }) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const avatarPath = account.avatarPath && /^\/api\/accounts\/[a-f0-9]{24}\/avatar$/.test(account.avatarPath) ? account.avatarPath : null;
  return <article className="account-card">
    <div className="account-identity">
      <span className="account-avatar">{avatarPath && avatarPath !== failedAvatar
        ? <img src={avatarPath} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={43} height={43} onError={() => setFailedAvatar(avatarPath)} />
        : <LeafMark size={28} />}</span>
      <div className="account-name"><h3>{account.nickname}</h3><span className="mono">UIN {account.maskedUin}</span></div>
      <span className={`account-presence ${account.connected === true ? 'connected' : ''}`}><span className="status-dot" />{account.statusLabel}</span>
    </div>
    <dl className="account-details">
      <div><dt>平台协议</dt><dd>{account.platform}</dd></div>
      <div><dt>Bot 版本</dt><dd>{account.botVersion}</dd></div>
    </dl>
    <div className="account-runtime"><Clock3 size={13} /><span>已运行</span><strong>{account.runtime}</strong></div>
    <div className="account-messages">
      <div><span><ArrowUpRight size={14} />发送消息</span><strong className="mono">{number(account.messages.sent)}</strong></div>
      <div><span><ArrowDownLeft size={14} />接收消息</span><strong className="mono">{number(account.messages.received)}</strong></div>
    </div>
    <div className="account-contacts"><Users size={13} /><span>好友 <b className="mono">{number(account.contacts.friends)}</b></span><span>群组 <b className="mono">{number(account.contacts.groups)}</b></span><span>群员 <b className="mono">{number(account.contacts.members)}</b></span></div>
  </article>;
}

export default function AccountsPanel({ automatic, refreshKey }: { automatic: boolean; refreshKey: number }) {
  const [snapshot, setSnapshot] = useState<Accounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch('/api/accounts', { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (typeof body.configured !== 'boolean' || (body.data && !Array.isArray(body.data.list))) throw new Error('Invalid response');
      if (current.signal.aborted) return;
      setSnapshot(body);
      setError(null);
    } catch {
      if (current.signal.aborted) return;
      setSnapshot(null);
      setError('暂时无法连接账号状态服务，请稍后重试。');
    } finally {
      if (controller.current === current) controller.current = null;
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { controller.current?.abort(); controller.current = null; };
  }, [refresh, refreshKey]);
  useEffect(() => {
    if (!automatic) return;
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [automatic, refresh]);

  const issue = error ?? snapshot?.error;
  const accounts = snapshot?.data?.list ?? [];
  return <section className="panel accounts-panel" id="accounts" aria-labelledby="accounts-title">
    <div className="accounts-heading"><div><div className="accounts-title"><Bot size={18} /><h2 id="accounts-title">账号状态</h2>{snapshot?.data && <span className="count-badge">{snapshot.data.total}</span>}</div><p>香菜的连接状态与消息日常</p></div><div className="accounts-actions"><span className="account-privacy"><ShieldCheck size={13} />账号已脱敏</span><button className="icon-button" aria-label="刷新账号状态" title="刷新账号状态" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'spinning' : ''} /></button></div></div>
    {loading && !snapshot && !error ? <div className="accounts-empty" role="status"><RefreshCw className="spinning" size={22} /><span>正在读取账号状态…</span></div>
      : issue ? <div className="accounts-empty account-issue" role="status"><Info size={23} /><strong>账号状态暂时不可用</strong><span>{issue}</span>{snapshot?.retryAt && <small>下次可重试时间：{new Date(snapshot.retryAt).toLocaleTimeString('zh-CN', { hour12: false })}{automatic ? ' · 将自动重试' : ' · 自动刷新已暂停'}</small>}</div>
      : !snapshot?.configured ? <div className="accounts-empty"><Bot size={25} /><strong>账号状态尚未接入</strong><span>等待管理员完成配置后，这里将显示香菜的账号信息。</span></div>
      : accounts.length === 0 ? <div className="accounts-empty"><Bot size={25} /><strong>暂未发现 Bot 账号</strong><span>账号连接后，运行状态会显示在这里。</span></div>
      : <div className="accounts-grid">{accounts.map(account => <AccountCard key={account.id} account={account} />)}</div>}
    <div className="accounts-footer"><span>账号状态为当前快照，不受 AI 统计时间范围影响</span><span>{snapshot?.fetchedAt ? `最近同步 ${new Date(snapshot.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待同步'}</span></div>
  </section>;
}
