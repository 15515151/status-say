import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp, CheckCheck } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LeafMark } from '../brand/BotIllustration';

type Props = {
  children: ReactNode;
  title: string;
  healthy?: boolean;
  stateLabel: string;
  fetchedAt?: string | null;
  loading?: boolean;
  note?: string;
};

export default function PageLayout({ children, title, healthy = false, stateLabel, fetchedAt, loading = false, note = '状态依据模型请求统计' }: Props) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${title} · 香菜`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, title]);

  return <>
    <a className="skip-link" href="#page-content">跳转到主要内容</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="香菜状态页首页"><span className="brand-symbol"><LeafMark size={25} /></span><strong>香菜</strong><span className="brand-divider" /><span className="brand-caption">运行状态</span></Link>
      <nav aria-label="页面导航"><NavLink to="/" end>概览</NavLink><NavLink to="/accounts">账号状态</NavLink><NavLink to="/requests">请求日志</NavLink><NavLink to="/statistics">解析统计</NavLink></nav>
      <span className={`header-status ${healthy ? '' : 'muted'}`} role="status"><span className={`status-dot ${healthy ? 'live' : ''}`} />{stateLabel}</span>
    </div></header>
    <main className="page-shell" id="page-content" tabIndex={-1}>
      {children}
      <footer className="site-footer"><div><LeafMark size={17} /><span>香菜的小小观测站</span><span className="footer-divider">/</span><span>{note}</span></div><span className="last-updated" role="status"><CheckCheck size={14} />{fetchedAt ? `最近同步 ${new Date(fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : loading ? '正在同步数据…' : '尚未同步'}<a href="#page-content" aria-label="回到顶部"><ArrowUp size={13} /></a></span></footer>
    </main>
  </>;
}
