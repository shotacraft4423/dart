import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/skillcheck', label: 'スキルチェック' },
  { to: '/rating', label: 'レーティング' },
  { to: '/history', label: '履歴' },
  { to: '/camera', label: 'カメラ解析' },
  { to: '/form', label: 'フォーム解析' },
];

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">🎯 ダーツ練習支援ツール</div>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
