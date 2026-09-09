import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageLayout from './components/layout/PageLayout';
import { StatusProvider } from './state/StatusContext';

const OverviewPage = lazy(() => import('./pages/overview/OverviewPage'));
const AccountsPage = lazy(() => import('./pages/accounts/AccountsPage'));
const RequestsPage = lazy(() => import('./pages/requests/RequestsPage'));
const StatisticsPage = lazy(() => import('./pages/statistics/StatisticsPage'));

function PageRoutes() {
  const { pathname, hash } = useLocation();
  // Preserve links to the sections that used to live on the homepage.
  if (pathname === '/' && (hash === '#accounts' || hash === '#requests')) {
    return <Navigate to={`/${hash.slice(1)}`} replace />;
  }

  return <StatusProvider>
    <Suspense fallback={<PageLayout title="正在加载" stateLabel="正在加载"><div className="page-loading" role="status">正在打开页面…</div></PageLayout>}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="*" element={<PageLayout title="页面不存在" stateLabel="页面不存在"><div className="page-loading"><h1>页面不存在</h1><p>请通过顶部导航打开所需页面。</p></div></PageLayout>} />
      </Routes>
    </Suspense>
  </StatusProvider>;
}

export default function App() {
  return <BrowserRouter><PageRoutes /></BrowserRouter>;
}
