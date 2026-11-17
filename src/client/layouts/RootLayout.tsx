import { Suspense, useEffect, useMemo, useState } from 'react';
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
import { Outlet, useLocation, useNavigate } from 'react-router';

/** 只接管普通左键点击，保留 Ctrl/Cmd/Shift/中键在新标签页打开的行为。 */
function isPlainLeftClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

// 菜单项用真实 <a>，这样首屏快照即使不 hydrate 也能导航。
const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '概览' },
  { key: '/todos', icon: <CheckSquareOutlined />, label: '待办 Demo' },
  { key: '/about', icon: <InfoCircleOutlined />, label: '技术栈' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': '概览',
  '/todos': '待办 Demo',
  '/about': '技术栈',
};

/** lg 断点（992px）以下视为移动端。与 Sider 的断点对齐 */
const MOBILE_QUERY = '(max-width: 991.98px)';

/**
 * 同步初始化的媒体查询 hook，避免首帧先渲染桌面再闪成移动端。
 */
function useIsBelowLg() {
  const [isBelow, setIsBelow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsBelow(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isBelow;
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
  const navigate = useNavigate();
  const isMobile = useIsBelowLg();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectedKey = useMemo(() => {
    const matched = MENU_ITEMS.map((item) => item.key)
      .filter((key) => key !== '/' && location.pathname.startsWith(key))
      .sort((a, b) => b.length - a.length)[0];
    return matched ?? '/';
  }, [location.pathname]);

  const title = PAGE_TITLES[selectedKey] ?? 'Swan Worker';

  const renderMenu = ({ closeDrawer = false } = {}) => (
    <nav className="swan-menu" aria-label="站点导航">
      {MENU_ITEMS.map((item) => {
        const selected = item.key === selectedKey;
        return (
          <div
            key={item.key}
            className={selected ? 'swan-menu-item is-selected' : 'swan-menu-item'}
            aria-current={selected ? 'page' : undefined}
          >
            <a
              href={item.key}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                if (closeDrawer) setMobileOpen(false);
                navigate(item.key);
              }}
            >
              <span className="swan-menu-icon">{item.icon}</span>
              <span className="swan-menu-label">{item.label}</span>
            </a>
          </div>
        );
      })}
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
            {/* 懒加载路由的加载态：只在首次进入 /todos、/about 时短暂出现 */}
            <Suspense
              fallback={
                <div className="swan-card swan-route-skeleton">
                  <div className="swan-skeleton-line" />
                  <div className="swan-skeleton-block" />
                  <div className="swan-skeleton-block" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>

        <footer className="swan-footer">
          Swan Worker · Bun + React 19 + Ant Design 6 + Rsbuild + Hono + Cloudflare D1
        </footer>
      </div>
    </div>
  );
}
