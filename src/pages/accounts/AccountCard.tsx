import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock3, Users } from 'lucide-react';
import { LeafMark } from '../../components/brand/BotIllustration';
import { fmt as number } from '../../lib/format';
import type { BotAccount } from '../../types';

export default function AccountCard({ account }: { account: BotAccount }) {
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
