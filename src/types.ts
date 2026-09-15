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

export type ServerMetricPoint = { timestamp: string; value: number };

export type ServerStatus = {
  id: string;
  name: string;
  region: string;
  tags: string[];
  os: string;
  arch: string;
  cpuName: string;
  cpuCores: number | null;
  presence: 'online' | 'offline' | 'unavailable';
  lastSeen: string | null;
  latest: {
    cpuPercent: number | null;
    load1: number | null;
    load5: number | null;
    load15: number | null;
    memoryUsed: number | null;
    memoryTotal: number | null;
    diskUsed: number | null;
    diskTotal: number | null;
    swapUsed: number | null;
    swapTotal: number | null;
    uploadBps: number | null;
    downloadBps: number | null;
    totalUpload: number | null;
    totalDownload: number | null;
    tcpConnections: number | null;
    udpConnections: number | null;
    processCount: number | null;
    uptimeSeconds: number | null;
  } | null;
  history: {
    cpu: ServerMetricPoint[];
    memory: ServerMetricPoint[];
    disk: ServerMetricPoint[];
  };
  error: string | null;
};

export type ServersResponse = {
  servers: ServerStatus[];
  fetchedAt: string;
  error: string | null;
};
