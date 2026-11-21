import { useState } from 'react';
import {
  ApiOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { NavLink, Outlet, useLocation, useMatches } from 'react-router';

import { BRAND } from '@/shared/brand';
import { loadTodosRoute } from '../route-loaders';
import { BrandMark } from '../components/BrandMark';

// 菜单项用真实 <a>，这样首屏快照即使不 hydrate 也能导航。
const MENU_ITEMS = [
  { to: '/', icon: <DashboardOutlined />, label: '概览' },
  { to: '/docs', icon: <FileTextOutlined />, label: '文档' },
  { to: '/todos', icon: <CheckSquareOutlined />, label: '待办 Demo' },
  { to: '/about', icon: <InfoCircleOutlined />, label: '技术栈' },
];

type RouteHandle = { title?: string };

const enableSpeedInsights =
  typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname);

function prefetchTodosRoute() {
  void loadTodosRoute().catch(() => {
    // A failed prefetch is harmless; navigation will retry and surface any real error.
  });
}

function Logo({ showText }: { showText: boolean }) {
  return (
    <div className="swan-logo">
      <span className="swan-logo-mark">
        <BrandMark size={30} />
      </span>
      {showText && (
        <span className="swan-logo-text">
          {BRAND.name}
          <small>{BRAND.tagline}</small>
        </span>
      )}
    </div>
  );
}

export default function RootLayout() {
  const location = useLocation();
  const matches = useMatches();
  const [collapsed, setCollapsed] = useState(false);

  const title =
    [...matches]
      .reverse()
      .map((match) => (match.handle as RouteHandle | undefined)?.title)
      .find((value): value is string => typeof value === 'string') ?? BRAND.name;

  const renderMenu = ({ closeDetails = false } = {}) => (
    <nav className="swan-menu" aria-label="站点导航">
      {MENU_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) => (isActive ? 'swan-menu-item is-selected' : 'swan-menu-item')}
          end={item.to === '/'}
          onFocus={item.to === '/todos' ? prefetchTodosRoute : undefined}
          onClick={
            closeDetails
              ? (event) => event.currentTarget.closest('details')?.removeAttribute('open')
              : undefined
          }
          onPointerEnter={item.to === '/todos' ? prefetchTodosRoute : undefined}
          onTouchStart={item.to === '/todos' ? prefetchTodosRoute : undefined}
          to={item.to}
        >
          <span className="swan-menu-icon">{item.icon}</span>
          <span className="swan-menu-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="swan-shell">
      <aside
        className={collapsed ? 'swan-sider is-collapsed' : 'swan-sider'}
        style={{ width: collapsed ? 0 : 228 }}
      >
        <Logo showText={!collapsed} />
        {!collapsed && renderMenu()}
      </aside>

      <div className="swan-main">
        <header className="swan-header">
          <div className="swan-header-left">
            <button
              type="button"
              className="swan-icon-button swan-desktop-menu-toggle"
              aria-label={collapsed ? '展开菜单' : '收起菜单'}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <details className="swan-mobile-menu">
              <summary className="swan-icon-button" aria-label="打开菜单">
                <MenuOutlined />
              </summary>
              <aside className="swan-mobile-panel">
                <Logo showText />
                {renderMenu({ closeDetails: true })}
              </aside>
            </details>
            <span className="swan-mobile-brand" aria-hidden="true">
              <BrandMark size={24} />
            </span>
            <span className="swan-title">{title}</span>
          </div>

          <div className="swan-header-right">
            <span className="swan-chip" title="运行在 Cloudflare 边缘网络">
              <CloudServerOutlined />
              Workers
            </span>
            <span className="swan-chip swan-chip-plain" title="Hono 提供的 API 层">
              <ApiOutlined />
              Hono
            </span>
          </div>
        </header>

        <main className="swan-content">
          <div className="swan-content-inner">
            <Outlet />
          </div>
        </main>

        <footer className="swan-footer">
          {BRAND.name} · {BRAND.tagline}
        </footer>
      </div>
      {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
    </div>
  );
}
