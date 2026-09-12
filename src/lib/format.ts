export const fmt = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const time = (seconds: number | null, full = false) => seconds === null ? '时间未知' : new Date(seconds * 1000).toLocaleString('zh-CN', { ...(full ? { month: '2-digit', day: '2-digit' } as const : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const rangeOptions = [{ value: 1, label: '最近 1 小时' }, { value: 6, label: '最近 6 小时' }, { value: 24, label: '最近 24 小时' }, { value: 72, label: '最近 3 天' }, { value: 168, label: '最近 7 天' }];
// 把秒数转成与上游一致的中文时长文本，用于展示平台媒体时长。
export const durationText = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '未测得';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const rest = total % 60;
  if (hours) return `${hours}小时${minutes}分`;
  if (minutes) return `${minutes}分${rest}秒`;
  return `${rest}秒`;
};
