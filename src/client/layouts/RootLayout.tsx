import { Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Layout, Menu, Skeleton, Tag, Tooltip, Typography } from 'antd';
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

const { Sider, Header, Content, Footer } = Layout;

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

/** lg 断点（992px）以下视为移动端。与 antd Sider 的 breakpoint="lg" 对齐 */
const MOBILE_QUERY = '(max-width: 991.98px)';

/**
 * 同步初始化的媒体查询 hook。
 * 不用 Grid.useBreakpoint()：它在首帧返回空对象，会让桌面端先闪一帧 Drawer。
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
    <Menu
      mode="inline"
      style={{ borderInlineEnd: 'none', padding: '12px 8px' }}
      selectedKeys={[selectedKey]}
      items={MENU_ITEMS}
      onClick={({ key }) => {
        navigate(key);
        if (closeDrawer) setMobileOpen(false);
      }}
    />
  );

  return (
    <Layout className="swan-shell">
      {/* 桌面端：Sider 在文档流内，可折叠 */}
      {!isMobile && (
        <Sider
          className="swan-sider"
          theme="light"
          width={228}
          trigger={null}
          collapsible
          collapsed={collapsed}
          collapsedWidth={0}
        >
          <Logo showText={!collapsed} />
          {renderMenu()}
        </Sider>
      )}

      {/* 移动端：Drawer 浮层覆盖，不挤压页面内容 */}
      {isMobile && (
        <Drawer
          placement="left"
          width={264}
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          closable={false}
          styles={{ body: { padding: 0 } }}
        >
          <Logo showText />
          {renderMenu({ closeDrawer: true })}
        </Drawer>
      )}

      <Layout>
        <Header className="swan-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Button
              type="text"
              aria-label={isMobile ? '打开菜单' : collapsed ? '展开菜单' : '收起菜单'}
              icon={
                isMobile ? (
                  <MenuOutlined />
                ) : collapsed ? (
                  <MenuUnfoldOutlined />
                ) : (
                  <MenuFoldOutlined />
                )
              }
              onClick={() => (isMobile ? setMobileOpen(true) : setCollapsed((value) => !value))}
            />
            <Typography.Text strong style={{ fontSize: 15 }}>
              {title}
            </Typography.Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tooltip title="运行在 Cloudflare 边缘网络">
              <Tag icon={<CloudServerOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>
                Workers
              </Tag>
            </Tooltip>
            <Tooltip title="Hono 提供的 API 层">
              <Tag icon={<ApiOutlined />} style={{ marginInlineEnd: 0 }}>
                Hono
              </Tag>
            </Tooltip>
          </div>
        </Header>

        <Content className="swan-content">
          <div className="swan-content-inner">
            {/* 懒加载路由的加载态：只在首次进入 /todos、/about 时短暂出现 */}
            <Suspense
              fallback={
                <div className="swan-card" style={{ padding: 24 }}>
                  <Skeleton active paragraph={{ rows: 6 }} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </Content>

        <Footer className="swan-footer">
          Swan Worker · Bun + React 19 + Ant Design 6 + Rsbuild + Hono + Cloudflare D1
        </Footer>
      </Layout>
    </Layout>
  );
}
