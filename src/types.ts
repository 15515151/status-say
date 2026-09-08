export type Log = {
  id: number;
  createdAt: number | null;
  status: 'success' | 'error';
  model: string;
  upstreamModel: string;
  group: string;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheTokens: number | null;
  durationSeconds: number | null;
  streaming: boolean;
  firstTokenMs: number | null;
};
export type Metric = {
  ttftMs: number | null;
  latencyMs: number | null;
  successRate: number | null;
  tokensPerSecond: number | null;
};
export type Group = Metric & { name: string; series: (Metric & { timestamp: number })[] };
type Source<T> = { data: T | null; fetchedAt: string | null; error: string | null };
export type Status = {
  model: string;
  hours: number;
  logs: Source<Log[]>;
  metrics: Source<{ model: string; groups: Group[] }>;
  fetchedAt: string;
};

export type BotAccount = {
  id: string;
  avatarPath: string | null;
  maskedUin: string;
  nickname: string;
  statusLabel: string;
  connected: boolean | null;
  platform: string;
  botVersion: string;
  runtime: string;
  messages: { sent: number | null; received: number | null };
  contacts: { friends: number | null; groups: number | null; members: number | null };
};
export type Accounts = {
  configured: boolean;
  data: { list: BotAccount[]; total: number } | null;
  fetchedAt: string | null;
  error: string | null;
  retryAt: string | null;
};
