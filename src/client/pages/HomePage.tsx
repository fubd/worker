import { useEffect, useState } from 'react';
import { Alert, Button, Col, Row, Skeleton, Steps, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';

import { api } from '../api/client';
import type { TodoStats } from '@/shared/types';

const STACK_TAGS = ['Bun', 'React 19', 'React Router 8', 'Ant Design 6', 'Rsbuild', 'Hono', 'D1', 'CCC'];

const CHAIN_STEPS = [
  { title: '浏览器', description: 'React 19 + antd 6' },
  { title: '静态资源', description: 'Rsbuild 产物托管在 Workers' },
  { title: 'Hono API', description: '/api/* 由 Worker 处理' },
  { title: 'D1 数据库', description: '边缘 SQLite，SQL 直连' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    api
      .stats()
      .then((data) => {
        if (alive) setStats(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <section className="swan-hero">
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          Cloudflare Workers · Edge Runtime
        </Tag>
        <h1>全栈跑在边缘节点上的 Swan Worker</h1>
        <p>
          一个可直接上手的最小全栈模板：Rsbuild 打包 React 19 + Ant Design 6 前端，Hono 提供
          API，D1 作为边缘数据库，全部由同一个 Worker 对外服务。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate('/todos')}>
            试试待办 Demo
          </Button>
          <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/about')}>
            查看技术栈
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 22 }}>
          {STACK_TAGS.map((tag) => (
            <Tag key={tag} variant="filled" style={{ marginInlineEnd: 0 }}>
              {tag}
            </Tag>
          ))}
        </div>
      </section>

      {error && (
        <Alert
          style={{ marginTop: 20 }}
          type="error"
          showIcon
          message="接口请求失败"
          description={`${error}　—— 本地开发请确认 wrangler dev 已启动，并执行过 bun run db:migrate:local`}
        />
      )}

      <div className="swan-section-title">
        <h2>数据看板</h2>
        <span>数据来自 GET /api/stats，实时读 D1</span>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <div className="swan-stat">
              <div className="swan-stat-label">总任务</div>
              <div className="swan-stat-value">{stats?.total ?? 0}</div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="swan-stat">
              <div className="swan-stat-label">进行中</div>
              <div className="swan-stat-value">{stats?.active ?? 0}</div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="swan-stat">
              <div className="swan-stat-label">已完成</div>
              <div className="swan-stat-value">{stats?.completed ?? 0}</div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="swan-stat">
              <div className="swan-stat-label">完成率</div>
              <div className="swan-stat-value">{stats?.completionRate ?? 0}%</div>
            </div>
          </Col>
        </Row>
      )}

      <div className="swan-section-title">
        <h2>一次请求的链路</h2>
        <span>边缘节点直接命中，不经过源站</span>
      </div>

      <div className="swan-card" style={{ padding: '26px 22px 6px' }}>
        <Steps
          items={CHAIN_STEPS.map((step, index) => ({
            title: step.title,
            description: step.description,
            status: 'finish' as const,
            icon: index === 3 ? <DatabaseOutlined /> : undefined,
          }))}
        />
      </div>

      <div className="swan-section-title">
        <h2>当前运行时</h2>
        <span>从 Worker 环境读取</span>
      </div>

      <div className="swan-card" style={{ padding: 20 }}>
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              运行时
            </Typography.Text>
            <div className="swan-mono" style={{ marginTop: 4 }}>
              {stats?.runtime ?? 'Cloudflare Workers'}
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              数据库
            </Typography.Text>
            <div className="swan-mono" style={{ marginTop: 4 }}>
              {stats?.database ?? 'Cloudflare D1'}
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              节点标识（cf-ray）
            </Typography.Text>
            <div className="swan-mono" style={{ marginTop: 4 }}>
              {stats?.region ?? '-'}
            </div>
          </Col>
        </Row>
      </div>

      <div className="swan-section-title">
        <h2>本地跑起来</h2>
        <span>三条命令搞定</span>
      </div>

      <pre className="swan-code-block">
        <code>{`bun install
bun run db:migrate:local   # 初始化本地 D1
bun run dev                # 前端 3000 + Worker 8787`}</code>
      </pre>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, color: '#64748b', fontSize: 12 }}>
        <span>
          <CheckCircleFilled style={{ color: '#52c41a', marginRight: 6 }} />
          HMR 由 Rsbuild 提供
        </span>
        <span>
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          /api 请求代理到 wrangler dev
        </span>
      </div>
    </>
  );
}
