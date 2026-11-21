import { useState, useSyncExternalStore } from 'react';
import {
  ApiOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { NavLink, Outlet, useLocation, useMatches } from 'react-router';

import { loadTodosRoute } from '../route-loaders';

// 菜单项用真实 <a>，这样首屏快照即使不 hydrate 也能导航。
const MENU_ITEMS = [
  { to: '/', icon: <DashboardOutlined />, label: '概览' },
  { to: '/todos', icon: <CheckSquareOutlined />, label: '待办 Demo' },
  { to: '/about', icon: <InfoCircleOutlined />, label: '技术栈' },
];

type RouteHandle = { title?: string };

/** lg 断点（992px）以下视为移动端。与 Sider 的断点对齐 */
const MOBILE_QUERY = '(max-width: 991.98px)';
const enableSpeedInsights = !['localhost', '127.0.0.1'].includes(window.location.hostname);

function prefetchTodosRoute() {
  void loadTodosRoute().catch(() => {
    // A failed prefetch is harmless; navigation will retry and surface any real error.
  });
}

function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isBelowLg() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** React 同步读取媒体查询，避免首帧先渲染桌面再闪成移动端。 */
function useIsBelowLg() {
  return useSyncExternalStore(subscribeToViewport, isBelowLg, () => false);
}

function Logo({ showText }: { showText: boolean }) {
  return (
    <div className="swan-logo">
      <span className="swan-logo-mark">S</span>
      {showText && (
        <span className="swan-logo-text">
          Swan Worker
          <small>edge runtime</small>
        </span>
      )}
    </div>
  );
}

export default function RootLayout() {
  const location = useLocation();
  const matches = useMatches();
  const isMobile = useIsBelowLg();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const title =
    [...matches]
      .reverse()
      .map((match) => (match.handle as RouteHandle | undefined)?.title)
      .find((value): value is string => typeof value === 'string') ?? 'Swan Worker';

  const renderMenu = ({ closeDrawer = false } = {}) => (
    <nav className="swan-menu" aria-label="站点导航">
      {MENU_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) => (isActive ? 'swan-menu-item is-selected' : 'swan-menu-item')}
          end={item.to === '/'}
          onFocus={item.to === '/todos' ? prefetchTodosRoute : undefined}
          onClick={closeDrawer ? () => setMobileOpen(false) : undefined}
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
      {/* 桌面端：Sider 在文档流内，可折叠 */}
      {!isMobile && (
        <aside
          className={collapsed ? 'swan-sider is-collapsed' : 'swan-sider'}
          style={{ width: collapsed ? 0 : 228 }}
        >
          <Logo showText={!collapsed} />
          {!collapsed && renderMenu()}
        </aside>
      )}

      {/* 移动端：浮层覆盖，不挤压页面内容 */}
      {isMobile && (
        <>
          <div
            className={mobileOpen ? 'swan-mobile-backdrop is-open' : 'swan-mobile-backdrop'}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={mobileOpen ? 'swan-mobile-panel is-open' : 'swan-mobile-panel'}
            aria-hidden={!mobileOpen}
          >
            <Logo showText />
            {renderMenu({ closeDrawer: true })}
          </aside>
        </>
      )}

      <div className="swan-main">
        <header className="swan-header">
          <div className="swan-header-left">
            <button
              type="button"
              className="swan-icon-button"
              aria-label={isMobile ? '打开菜单' : collapsed ? '展开菜单' : '收起菜单'}
              onClick={() => (isMobile ? setMobileOpen(true) : setCollapsed((value) => !value))}
            >
              {isMobile ? (
                <MenuOutlined />
              ) : collapsed ? (
                <MenuUnfoldOutlined />
              ) : (
                <MenuFoldOutlined />
              )}
            </button>
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
          Swan Worker · Bun + React 19 + Ant Design 6 + Rsbuild + Hono + Cloudflare D1
        </footer>
      </div>
      {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
    </div>
  );
}
