import { useMemo, useState } from 'react';
import { Button, Layout, Menu, Tag, Tooltip, Typography } from 'antd';
import {
  ApiOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
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

export default function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = useMemo(() => {
    const matched = MENU_ITEMS.map((item) => item.key)
      .filter((key) => key !== '/' && location.pathname.startsWith(key))
      .sort((a, b) => b.length - a.length)[0];
    return matched ?? '/';
  }, [location.pathname]);

  const title = PAGE_TITLES[selectedKey] ?? 'Swan Worker';

  return (
    <Layout className="swan-shell">
      <Sider
        className="swan-sider"
        theme="light"
        width={228}
        trigger={null}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={0}
      >
        <div className="swan-logo">
          <span className="swan-logo-mark">S</span>
          {!collapsed && (
            <span className="swan-logo-text">
              Swan Worker
              <small>edge runtime</small>
            </span>
          )}
        </div>

        <Menu
          mode="inline"
          style={{ borderInlineEnd: 'none', padding: '12px 8px' }}
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="swan-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Button
              type="text"
              aria-label={collapsed ? '展开菜单' : '收起菜单'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
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
            <Outlet />
          </div>
        </Content>

        <Footer className="swan-footer">
          Swan Worker · Bun + React 19 + Ant Design 6 + Rsbuild + Hono + Cloudflare D1
        </Footer>
      </Layout>
    </Layout>
  );
}
