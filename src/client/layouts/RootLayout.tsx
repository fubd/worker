import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Avatar, Dropdown } from 'antd';
import {
  CloudSyncOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  ReadOutlined,
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

function FlightIllustration() {
  return (
    <svg
      className="swan-flight-art"
      viewBox="0 0 680 360"
      fill="none"
      role="img"
      aria-label="纸张沿着风的轨迹飞行，雨燕从旁边掠过"
    >
      <path
        className="swan-flight-trail"
        d="M4 312C105 260 155 148 265 164C358 178 365 290 470 226C544 181 577 103 672 58"
      />
      <path
        className="swan-flight-trail is-secondary"
        d="M75 336C152 292 191 222 275 234C342 244 367 315 438 271C503 231 550 161 627 132"
      />
      <g className="swan-paper-float is-back">
        <g transform="translate(355 54) rotate(11)">
          <path d="M0 0H122L151 29V184H0Z" fill="#9FC8FF" fillOpacity=".22" />
          <path d="M122 0V29H151" stroke="#D9E9FF" strokeOpacity=".55" />
          <path d="M25 55H118M25 78H102M25 101H113" stroke="#D9E9FF" strokeOpacity=".35" />
        </g>
      </g>
      <g className="swan-paper-float is-front">
        <g transform="translate(214 95) rotate(-8)">
          <path d="M0 0H164L196 32V218H0Z" fill="#FBFCF8" stroke="rgba(255,255,255,.34)" />
          <path d="M164 0V32H196" stroke="#BFD7F8" />
          <path d="M31 64H150M31 91H127M31 118H157" stroke="#9CB6D6" strokeWidth="3" />
          <path d="M31 151H88" stroke="#2F6FE8" strokeWidth="5" strokeLinecap="round" />
          <path d="M31 178H132" stroke="#B7C8DB" strokeWidth="3" />
        </g>
      </g>
      <g className="swan-flight-birds" fill="#D9E9FF">
        <path
          transform="translate(425 177) scale(.9)"
          d="M0 24C15 8 30 6 42 15C50 11 61 11 71 16C61 20 54 26 51 34C43 30 37 31 32 37L24 50L22 36C14 30 7 27 0 24Z"
        />
        <path
          transform="translate(528 107) scale(.62)"
          d="M0 24C15 8 30 6 42 15C50 11 61 11 71 16C61 20 54 26 51 34C43 30 37 31 32 37L24 50L22 36C14 30 7 27 0 24Z"
        />
        <path
          transform="translate(100 128) scale(.45)"
          d="M0 24C15 8 30 6 42 15C50 11 61 11 71 16C61 20 54 26 51 34C43 30 37 31 32 37L24 50L22 36C14 30 7 27 0 24Z"
        />
      </g>
    </svg>
  );
}

function GuestFrame({ children }: { children: ReactNode }) {
  return (
    <div className="swan-guest">
      <header className="swan-guest-header">
        <Logo showText />
        <span className="swan-guest-edition">私人写作空间</span>
      </header>
      <main className="swan-guest-main">
        <section className="swan-guest-story">
          <div className="swan-guest-story-copy">
            <span className="swan-guest-kicker">Yuyan / 雨燕</span>
            <h1>
              <span>让文字</span>
              <span className="is-accent">飞起来。</span>
            </h1>
            <p>给还没写完的念头留一处安静的地方。打开就能写，离开也会保存，下一次回来继续往前。</p>
            <ul className="swan-guest-features" aria-label="产品特点">
              <li>
                <LockOutlined />
                私人
              </li>
              <li>
                <CloudSyncOutlined />
                自动保存
              </li>
              <li>
                <ReadOutlined />
                随时续写
              </li>
            </ul>
          </div>
          <FlightIllustration />
          <p className="swan-guest-quote">没有信息流，没有打扰，只有你的文字。</p>
        </section>
        <section className="swan-guest-entry">{children}</section>
      </main>
    </div>
  );
}

export default function RootLayout() {
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const { status, user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

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

  if (location.pathname === '/docs' && status === 'loading') {
    return (
      <>
        <GuestFrame>
          <div className="swan-guest-login-placeholder" aria-label="正在读取登录状态">
            <span />
            <span />
            <span />
          </div>
        </GuestFrame>
        {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
      </>
    );
  }

  if (location.pathname === '/docs' && status === 'unauthenticated') {
    return (
      <>
        <GuestFrame>
          <Outlet />
        </GuestFrame>
        {enableSpeedInsights && <SpeedInsights route={location.pathname} />}
      </>
    );
  }

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
            {status === 'authenticated' && user ? (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'password',
                      icon: <LockOutlined />,
                      label: user.hasPassword ? '修改登录密码' : '设置登录密码',
                    },
                    {
                      type: 'divider',
                    },
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: '退出登录',
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'password') setPasswordModalOpen(true);
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
