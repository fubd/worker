import { Card, Col, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import pkg from '../../../package.json';

type StackRow = {
  key: string;
  layer: string;
  tech: string;
  version: string;
  usage: string;
};

const deps = pkg.dependencies as Record<string, string>;
const devDeps = pkg.devDependencies as Record<string, string>;
const version = (name: string) => (deps[name] ?? devDeps[name] ?? '-').replace('^', '');

const STACK: StackRow[] = [
  {
    key: 'bun',
    layer: '运行时 / 包管理',
    tech: 'Bun',
    version: '1.4.x',
    usage: '装依赖、跑脚本、并发起服务，内置 bun check 做类型检查',
  },
  {
    key: 'react',
    layer: '视图',
    tech: 'React',
    version: version('react'),
    usage: '前端 UI 渲染',
  },
  {
    key: 'router',
    layer: '路由',
    tech: 'React Router',
    version: version('react-router'),
    usage: 'createBrowserRouter 客户端路由',
  },
  {
    key: 'antd',
    layer: 'UI 组件库',
    tech: 'Ant Design',
    version: version('antd'),
    usage: '组件、主题 Token、CSS 变量',
  },
  {
    key: 'rsbuild',
    layer: '构建',
    tech: 'Rsbuild',
    version: version('@rsbuild/core'),
    usage: '基于 Rspack 的构建工具，产物输出 dist/',
  },
  {
    key: 'hono',
    layer: '服务端框架',
    tech: 'Hono',
    version: version('hono'),
    usage: 'Worker 里的路由、中间件、JSON 响应',
  },
  {
    key: 'd1',
    layer: '数据库',
    tech: 'Cloudflare D1',
    version: 'edge SQLite',
    usage: '通过 DB 绑定执行 SQL，migrations 管理表结构',
  },
];

const columns: ColumnsType<StackRow> = [
  {
    title: '层次',
    dataIndex: 'layer',
    width: 150,
    render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text>,
  },
  {
    title: '技术',
    dataIndex: 'tech',
    width: 160,
    render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
  },
  {
    title: '版本',
    dataIndex: 'version',
    width: 130,
    render: (value: string) => <Tag variant="filled">{value}</Tag>,
  },
  { title: '作用', dataIndex: 'usage' },
];

const TREE = `swan-worker/
├── migrations/            # D1 迁移与种子数据
├── public/                # 静态资源（favicon 等）
├── src/
│   ├── client/            # 前端：React + antd + react-router
│   │   ├── api/           # 封装 /api 请求
│   │   ├── layouts/       # 布局
│   │   ├── pages/         # 页面
│   │   ├── router.tsx     # 路由表
│   │   └── main.tsx       # 入口
│   ├── shared/            # 前后端共享类型
│   └── worker/            # Worker：Hono + D1
│       ├── db/            # 数据访问层（纯 SQL）
│       ├── routes/        # API 路由
│       └── index.ts       # Worker 入口
├── rsbuild.config.ts
├── wrangler.jsonc         # Worker / 静态资源 / D1 绑定
└── tsconfig.json`;

const COMMANDS = `bun install                 # 安装依赖
bun run dev                 # 前端 3000 + Worker 8787
bun run check               # 类型检查（bun check，无需 tsc）
bun run db:migrate:local    # 本地 D1 建表
bun run db:seed:local       # 写入演示数据
bun run build               # 构建前端到 dist/
bun run deploy              # 构建并 wrangler deploy`;

const DEPLOY = `# 1. 登录 Cloudflare
bunx wrangler login

# 2. 创建 D1 数据库，把返回的 database_id 填进 wrangler.jsonc
bun run db:create

# 3. 在线上库执行迁移
bun run db:migrate:remote

# 4. 部署
bun run deploy`;

export default function AboutPage() {
  return (
    <>
      <Card variant="borderless" className="swan-card" styles={{ body: { padding: 24 } }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          技术栈
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          同一个 Worker 同时承担静态资源托管与 API 服务：<code>/api/*</code> 走 Hono，
          其余路径交给静态资源绑定，未命中时回退到 SPA 的 index.html。
        </Typography.Paragraph>
      </Card>

      <Card
        variant="borderless"
        className="swan-card"
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 8 } }}
      >
        <Table
          columns={columns}
          dataSource={STACK}
          pagination={false}
          size="middle"
          scroll={{ x: 640 }}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            variant="borderless"
            className="swan-card"
            title="常用命令"
            styles={{ body: { padding: 16 } }}
          >
            <pre className="swan-code-block">
              <code>{COMMANDS}</code>
            </pre>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            variant="borderless"
            className="swan-card"
            title="部署到 Cloudflare"
            styles={{ body: { padding: 16 } }}
          >
            <pre className="swan-code-block">
              <code>{DEPLOY}</code>
            </pre>
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        className="swan-card"
        style={{ marginTop: 16 }}
        title="目录结构"
        styles={{ body: { padding: 16 } }}
      >
        <pre className="swan-code-block">
          <code>{TREE}</code>
        </pre>
      </Card>

      <Card
        variant="borderless"
        className="swan-card"
        style={{ marginTop: 16 }}
        title="关键约定"
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Space direction="vertical" size={10}>
          <Typography.Text>
            <Tag color="blue">wrangler.jsonc</Tag>
            <code>assets.run_worker_first: ["/api/*"]</code> 保证 API 先到 Worker，
            其余请求直接命中静态资源。
          </Typography.Text>
          <Typography.Text>
            <Tag color="blue">D1</Tag>
            所有 SQL 收敛在 <code>src/worker/db/</code>，路由层只做参数校验与响应拼装。
          </Typography.Text>
          <Typography.Text>
            <Tag color="blue">开发代理</Tag>
            Rsbuild dev server 把 <code>/api</code> 代理到 <code>127.0.0.1:8787</code>， 前端 HMR 与
            Worker 热重启互不干扰。
          </Typography.Text>
        </Space>
      </Card>
    </>
  );
}
