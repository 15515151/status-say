import { Info, RefreshCw, Server } from 'lucide-react';
import PageLayout from '../../components/layout/PageLayout';
import PageIntro from '../../components/layout/PageIntro';
import RefreshControls from '../../components/status/RefreshControls';
import { useStatus } from '../../state/StatusContext';
import ServerCard from './ServerCard';
import useServerStatus from './useServerStatus';
import './servers.css';

export default function ServersPage() {
  const { automatic, setAutomatic } = useStatus();
  const { snapshot, error, loading, refresh } = useServerStatus(automatic);
  const servers = snapshot?.servers ?? [];
  const issue = error ?? snapshot?.error ?? null;
  const onlineCount = servers.filter(server => server.presence === 'online').length;
  const unavailableCount = servers.filter(server => server.presence === 'unavailable').length;
  const healthy = servers.length > 0 && onlineCount === servers.length && !issue;
  const stateLabel = loading && !snapshot
    ? '正在连接'
    : !snapshot
      ? '等待数据'
      : servers.length === 0 && !issue
        ? '等待数据'
        : issue && unavailableCount > 0
          ? '连接异常'
          : onlineCount < servers.length
            ? '部分离线'
            : issue
              ? '连接异常'
              : '全部在线';

  return <PageLayout title="服务器状态" healthy={healthy} stateLabel={stateLabel} fetchedAt={snapshot?.fetchedAt} loading={loading} note="状态来源：Komari 公开节点数据">
    <PageIntro eyebrow="XIANGCAI / SERVER STATUS" title="服务器状态" description="看看香菜的几台服务器正在如何运行，资源和上报状态每 30 秒更新一次。" />

    <div className="overview-toolbar server-toolbar">
      <div className="section-label"><span className="section-square" /><h2>节点概况</h2><span>{servers.length > 0 ? `在线 ${onlineCount} / ${servers.length}` : '等待节点数据'}</span></div>
      <RefreshControls automatic={automatic} setAutomatic={setAutomatic} loading={loading} refresh={refresh} refreshLabel="刷新服务器状态" />
    </div>

    {issue && <div className="warning-banner server-warning" role="alert"><Info size={18} /><div><strong>{servers.length > 0 ? '部分服务器数据暂时不可用' : '暂时无法更新服务器状态'}</strong><p>{issue}{snapshot && servers.length > 0 ? ' 当前保留可用节点的最新数据。' : ''}</p></div><button onClick={() => void refresh()} disabled={loading}>重新连接</button></div>}

    {loading && !snapshot ? <div className="servers-grid" aria-label="正在读取服务器状态">{Array.from({ length: 3 }, (_, index) => <div className="server-card server-card-skeleton" key={index}><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-block" /></div>)}</div>
      : servers.length > 0 ? <div className="servers-grid">{servers.map(server => <ServerCard key={server.id} server={server} />)}</div>
        : <div className="servers-empty" role="status"><Server size={28} /><strong>{issue ? '等待恢复连接' : '暂无可展示的服务器'}</strong><span>{issue ? '服务器节点列表暂时不可用，请稍后重试。' : '上游暂时没有返回可展示的节点。'}</span><button className="button" onClick={() => void refresh()} disabled={loading}>{loading ? <RefreshCw size={15} className="spinning" /> : <RefreshCw size={15} />}重新读取</button></div>}
  </PageLayout>;
}
