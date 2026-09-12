// 媒体与处理的聚合值，全局与按群统计共用同一结构。
export type ParseMedia = {
  successCount: number | null;
  failureCount: number | null;
  successRate: number | null;
  videoDuration: string | null;
  audioDuration: string | null;
  totalDuration: string | null;
  averageDuration: string | null;
  maximumDuration: string | null;
  averageProcessTime: string | null;
  maximumProcessTime: string | null;
  totalBytes: string | null;
  averageBytes: string | null;
  durationSamples: number | null;
  sizeSamples: number | null;
};

export type ParsePlatform = { name: string; count: number };
export type ParseHistoryDay = { date: string; count: number | null; mediaSeconds: number | null };
// 群排行：群号已脱敏，不含群名。头像走本站代理，路径里只有不透明 ID。
export type ParseTopGroup = { groupId: string; count: number; users: number | null; avatarPath: string | null };
// 平台媒体时长排行，秒数用于排序。
export type ParsePlatformMedia = { name: string; videoSeconds: number; audioSeconds: number; totalSeconds: number };

export type ParseStatistics = {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  retryAt: string | null;
  data: {
    totalParses: number;
    totalUsers: number | null;
    totalGroups: number | null;
    platforms: ParsePlatform[];
    history: ParseHistoryDay[];
    hasHistory: boolean;
    topGroups: ParseTopGroup[];
    platformMedia: ParsePlatformMedia[];
    mediaTrendSeconds: number | null;
    media: ParseMedia;
  } | null;
};

// 按群查询的响应：群号在服务端已脱敏，这里只会拿到掩码后的形式。
// 上游群端点不返回历史趋势，改为群内累计、群排行与全局对照。
export type GroupParseStatistics = {
  configured: boolean;
  exists: boolean;
  data: {
    groupId: string;
    totalParses: number;
    totalUsers: number | null;
    groupRank: number | null;
    globalTotal: number | null;
    globalGroups: number | null;
    platforms: ParsePlatform[];
    media: ParseMedia;
  } | null;
  fetchedAt: string | null;
  error: string | null;
  retryAt: string | null;
};
