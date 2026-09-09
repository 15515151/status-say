import PageLayout from '../../components/layout/PageLayout';
import PageIntro from '../../components/layout/PageIntro';
import RefreshControls from '../../components/status/RefreshControls';
import { useStatus } from '../../state/StatusContext';
import AccountsPanel from './AccountsPanel';
import AccountsSummary from './AccountsSummary';
import useAccounts from './useAccounts';
import GroupStatsPanel from './GroupStatsPanel';
import useGroupStats from './useGroupStats';
import './accounts.css';

export default function AccountsPage() {
  const { automatic, setAutomatic } = useStatus();
  const { snapshot, error, loading, refresh } = useAccounts(automatic);
  const groups = useGroupStats(automatic);
  const refreshing = loading || groups.loading;
  const refreshAll = async () => { await Promise.all([refresh(), groups.refresh()]); };
  const accounts = snapshot?.data?.list ?? [];
  const issue = error ?? snapshot?.error;
  const healthy = !issue && accounts.length > 0 && accounts.every(account => account.connected === true);
  const stateLabel = loading && !snapshot ? '正在连接' : issue ? '连接异常' : !snapshot?.configured ? '等待接入' : accounts.length === 0 ? '暂无账号' : healthy ? '全部在线' : accounts.some(account => account.connected === false) ? '部分离线' : '状态待确认';

  return <PageLayout title="账号状态" healthy={healthy} stateLabel={stateLabel} fetchedAt={snapshot?.fetchedAt} loading={refreshing} note="状态依据账号连接快照">
    <PageIntro eyebrow="XIANGCAI / BOT ACCOUNTS" title="账号状态" description="看看香菜是否在线，以及消息、好友和群组的最新动态。" />
    <div className="overview-toolbar">
      <div className="section-label"><span className="section-square" /><h2>连接概况</h2><span>{automatic ? '每 30 秒更新' : '自动刷新已暂停'}</span></div>
      <RefreshControls automatic={automatic} setAutomatic={setAutomatic} loading={refreshing} refresh={refreshAll} refreshLabel="刷新账号状态与群组统计" />
    </div>
    <AccountsSummary accounts={!issue && snapshot?.configured ? snapshot.data?.list ?? null : null} />
    <GroupStatsPanel snapshot={groups.snapshot} error={groups.error} loading={groups.loading} automatic={automatic} />
    <AccountsPanel automatic={automatic} snapshot={snapshot} error={error} loading={loading} />
  </PageLayout>;
}
