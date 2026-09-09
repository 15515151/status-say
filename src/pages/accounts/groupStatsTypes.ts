export type GroupBot = {
  botId: string;
  type: 'OneBot' | 'ICQQ' | '其他';
  groupCount: number;
  uniqueGroupCount: number;
  status: '已读取' | '离线' | '获取失败' | '使用缓存' | '未知';
};

export type GroupStats = {
  configured: boolean;
  data: {
    oneBotCount: number;
    icqqCount: number;
    skippedBots: number;
    loadedBots: number;
    failedBots: number;
    cachedBots: number;
    offlineBots: number;
    totalGroups: number;
    uniqueGroups: number;
    duplicateGroups: number;
    bots: GroupBot[];
  } | null;
  partial: boolean;
  updatedAt: string | null;
  fetchedAt: string | null;
  error: string | null;
  retryAt: string | null;
};
