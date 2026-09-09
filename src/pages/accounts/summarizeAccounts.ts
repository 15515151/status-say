import type { BotAccount } from '../../types';

function isSandbox(account: BotAccount) {
  return [account.nickname, account.botVersion].some(value => /^QQBot\s*沙盒(?:\s|$)/i.test(value.trim()))
    || /^sandbox(?:\s|$)/i.test(account.platform.trim());
}

function sumKnown(accounts: BotAccount[], read: (account: BotAccount) => number | null) {
  let total = 0;
  let missing = 0;
  for (const account of accounts) {
    const value = read(account);
    if (value === null) missing++;
    else total += value;
  }
  return { value: accounts.length > 0 && missing === accounts.length ? null : total, missing };
}

export function summarizeAccounts(accounts: BotAccount[]) {
  const included = accounts.filter(account => !isSandbox(account));
  return {
    count: included.length,
    sent: sumKnown(included, account => account.messages.sent),
    received: sumKnown(included, account => account.messages.received),
    friends: sumKnown(included, account => account.contacts.friends),
  };
}
