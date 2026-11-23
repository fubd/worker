import { lazy, Suspense, useState } from 'react';
import { Avatar, Dropdown } from 'antd';
import {
  ChevronDown,
  FileText,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from 'lucide-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Link, Navigate, Outlet, useLocation, useMatches, useNavigate } from 'react-router';

import { BRAND } from '@/shared/brand';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../auth/AuthProvider';

const MENU_ITEMS = [
  {
    to: '/docs',
    icon: <FileText aria-hidden="true" size={16} strokeWidth={1.8} />,
    label: '全部文档',
    view: 'documents',
  },
  {
    to: '/docs?view=trash',
    icon: <Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />,
    label: '回收站',
    view: 'trash',
  },
] as const;

type RouteHandle = { title?: string };

const enableSpeedInsights = import.meta.env.PROD;
const PasswordSettingsModal = lazy(() => import('../components/PasswordSettingsModal'));

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

function WorkspaceLoading() {
  return (
    <div className="swan-workspace-loading" role="status" aria-label="正在读取登录状态">
      <BrandMark size={42} />
      <span>正在打开雨燕…</span>
    </div>
  );
}

export default function RootLayout() {
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const { status, user, bindProvider, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const linkedProviders = user?.linkedProviders ?? [];

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
            aria-current={isSelected ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            onClick={
              closeDetails
                ? (event) => event.currentTarget.closest('details')?.removeAttribute('open')
                : undefined
            }
            title={collapsed ? item.label : undefined}
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
    navigate('/login', { replace: true });
  };

  if (status === 'loading') return <WorkspaceLoading />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  return (
    <div className="swan-shell">
      <aside
        className={collapsed ? 'swan-sider is-collapsed' : 'swan-sider'}
        style={{ width: collapsed ? 76 : 220 }}
      >
        <Logo showText={!collapsed} />
        {renderMenu()}
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
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.8} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.8} />
              )}
            </button>
            <details className="swan-mobile-menu">
              <summary className="swan-icon-button" aria-label="打开菜单">
                <Menu aria-hidden="true" size={18} strokeWidth={1.8} />
              </summary>
              <aside className="swan-mobile-panel">
                <Logo showText />
                {renderMenu({ closeDetails: true })}
              </aside>
            </details>
            <span className="swan-mobile-brand" aria-hidden="true">
              <BrandMark size={24} />
            </span>
            <span className="swan-header-title">
              <span className="swan-header-eyebrow">雨燕空间</span>
              <span className="swan-title">{title}</span>
            </span>
          </div>

          <div className="swan-header-right">
            {status === 'authenticated' && user ? (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'password',
                      icon: <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />,
                      label: user.hasPassword ? '修改登录密码' : '设置登录密码',
                    },
                    ...(!linkedProviders.includes('google')
                      ? [
                          {
                            key: 'bind-google',
                            icon: <Link2 aria-hidden="true" size={16} strokeWidth={1.8} />,
                            label: '绑定 Google',
                          },
                        ]
                      : []),
                    ...(!linkedProviders.includes('github')
                      ? [
                          {
                            key: 'bind-github',
                            icon: <Link2 aria-hidden="true" size={16} strokeWidth={1.8} />,
                            label: '绑定 GitHub',
                          },
                        ]
                      : []),
                    {
                      type: 'divider',
                    },
                    {
                      key: 'logout',
                      icon: <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />,
                      label: '退出登录',
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'password') setPasswordModalOpen(true);
                    if (key === 'bind-google') bindProvider('google');
                    if (key === 'bind-github') bindProvider('github');
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
                    <small>{user.email ?? `@${user.username ?? '未绑定'}`}</small>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="swan-user-chevron"
                    size={14}
                    strokeWidth={1.8}
                  />
                </button>
              </Dropdown>
            ) : null}
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
      {passwordModalOpen && (
        <Suspense fallback={null}>
          <PasswordSettingsModal
            hasPassword={Boolean(user?.hasPassword)}
            onClose={() => setPasswordModalOpen(false)}
          />
        </Suspense>
      )}
      {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
    </div>
  );
}
