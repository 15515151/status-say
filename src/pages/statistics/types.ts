export type ParseStatistics = {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  retryAt: string | null;
  data: {
    totalParses: number;
    totalUsers: number | null;
    platforms: { name: string; count: number }[];
    history: { date: string; count: number | null; mediaSeconds: number | null }[];
    media: {
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
  } | null;
};
