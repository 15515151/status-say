import type { ParseMedia } from './types';

// 图表与指标共用的配色。
export const colors = ['#61834c', '#5b86a6', '#b07080', '#a88b46'];

// 媒体与处理的展示项，全局与按群统计共用同一顺序。
export const mediaMetricsOf = (media: ParseMedia): [string, string | null][] => [
  ['视频总时长', media.videoDuration], ['音频总时长', media.audioDuration],
  ['媒体总时长', media.totalDuration], ['平均媒体时长', media.averageDuration],
  ['最长媒体时长', media.maximumDuration], ['平均处理耗时', media.averageProcessTime],
  ['最长处理耗时', media.maximumProcessTime], ['累计文件大小', media.totalBytes],
  ['平均文件大小', media.averageBytes],
];
