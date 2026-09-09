import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { fmt, time } from '../../lib/format';
import type { Log } from '../../types';

export function StatusPill({ success }: { success: boolean }) {
  return <span className={`status-pill ${success ? '' : 'is-error'}`}>{success ? <Check size={12} strokeWidth={2.5} /> : <X size={12} />} {success ? '成功' : '失败'}</span>;
}

export default function LogDetail({ log, close }: { log: Log | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (log) { dialog.current?.showModal(); setCopied(false); setCopyError(false); }
    else dialog.current?.close();
  }, [log]);
  async function copy() {
    if (!log) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
    } catch { setCopyError(true); }
  }
  return <dialog ref={dialog} className="detail-dialog" aria-labelledby="request-detail-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    {log && <div className="dialog-inner">
      <div className="dialog-heading"><div><span className="eyebrow">REQUEST DETAIL</span><h2 id="request-detail-title">请求详情 <span className="mono">#{log.id}</span></h2></div><button className="icon-button" onClick={close} aria-label="关闭详情"><X size={20} /></button></div>
      <div className="detail-status"><StatusPill success={log.status === 'success'} /><span>{time(log.createdAt, true)}</span></div>
      <dl className="detail-grid">
        <div><dt>请求模型</dt><dd>{log.model || '—'}</dd></div><div><dt>实际模型</dt><dd>{log.upstreamModel || '—'}</dd></div>
        <div><dt>请求耗时</dt><dd>{fmt(log.durationSeconds, 2)} s</dd></div><div><dt>请求方式</dt><dd>{log.streaming ? '流式响应' : '非流式响应'}</dd></div>
        <div><dt>输入 Token</dt><dd>{fmt(log.promptTokens)}</dd></div><div><dt>输出 Token</dt><dd>{fmt(log.completionTokens)}</dd></div>
        <div><dt>缓存 Token</dt><dd>{fmt(log.cacheTokens)}</dd></div><div><dt>分组</dt><dd>{log.group || '—'}</dd></div>
        <div><dt>首字耗时</dt><dd>{log.firstTokenMs == null ? '未提供有效测量' : `${fmt(log.firstTokenMs)} ms`}</dd></div>
      </dl>
      <div className="dialog-footer"><span role="status">{copyError ? '复制失败，请检查浏览器权限。' : '仅展示请求的运行数据'}</span><button className="button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制记录'}</button></div>
    </div>}
  </dialog>;
}
