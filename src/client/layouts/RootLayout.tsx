import { useState } from 'react';
import { Avatar, Button, Dropdown } from 'antd';
import {
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Link, Outlet, useLocation, useMatches, useNavigate } from 'react-router';

import { BRAND } from '@/shared/brand';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../auth/AuthProvider';

const MENU_ITEMS = [
  { to: '/docs', icon: <FileTextOutlined />, label: '全部文档', view: 'documents' },
  { to: '/docs?view=trash', icon: <DeleteOutlined />, label: '回收站', view: 'trash' },
] as const;

type RouteHandle = { title?: string };

const enableSpeedInsights = import.meta.env.PROD;

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
  const navigate = useNavigate();
  const { status, user, signIn, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const currentView = new URLSearchParams(location.search).get('view');
  const routeTitle =
    [...matches]
      .reverse()
      .map((match) => (match.handle as RouteHandle | undefined)?.title)
      .find((value): value is string => typeof value === 'string') ?? BRAND.name;
  const title = location.pathname === '/docs' && currentView === 'trash' ? '回收站' : routeTitle;

  const renderMenu = ({ closeDetails = false } = {}) => (
    <nav className="swan-menu" aria-label="站点导航">
      {MENU_ITEMS.map((item) => {
        const isSelected =
          location.pathname === '/docs' &&
          (item.view === 'trash' ? currentView === 'trash' : currentView !== 'trash');
        return (
          <Link
            key={item.to}
            className={isSelected ? 'swan-menu-item is-selected' : 'swan-menu-item'}
            onClick={
              closeDetails
                ? (event) => event.currentTarget.closest('details')?.removeAttribute('open')
                : undefined
            }
            to={item.to}
          >
            <span className="swan-menu-icon">{item.icon}</span>
            <span className="swan-menu-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const handleLogout = async () => {
    await signOut();
    navigate('/docs');
  };

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
            {status === 'loading' ? (
              <span className="swan-user-loading" aria-label="正在读取登录状态" />
            ) : status === 'authenticated' && user ? (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: '退出登录',
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'logout') void handleLogout();
                  },
                }}
              >
                <button type="button" className="swan-user-button">
                  <Avatar size={28} src={user.avatarUrl || undefined}>
                    {user.name.slice(0, 1).toUpperCase()}
                  </Avatar>
                  <span className="swan-user-copy">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                  <DownOutlined className="swan-user-chevron" />
                </button>
              </Dropdown>
            ) : (
              <Button icon={<LoginOutlined />} onClick={signIn}>
                登录
              </Button>
            )}
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
