import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { todoRoutes } from './routes/todos';
import { statsRoutes } from './routes/stats';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('/api/*', prettyJSON());
app.use('/api/*', cors());

/** 健康检查。本地 wrangler dev 没有 cf-ray 头，线上一定有 */
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    runtime: 'cloudflare-workers',
    environment: c.env.ENVIRONMENT ?? (c.req.header('cf-ray') ? 'production' : 'local'),
    time: new Date().toISOString(),
  }),
);

app.route('/api/todos', todoRoutes);
app.route('/api/stats', statsRoutes);

/** 统一错误处理：细节只进日志，响应里不暴露内部信息 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const rayId = c.req.header('cf-ray') ?? 'local';
  console.error(`[worker] unhandled error (ray=${rayId}):`, err);

  return c.json({ error: 'Internal Server Error', traceId: rayId }, 500);
});

/**
 * 兜底：
 * - /api 与 /api/* 未命中 → 返回 JSON 404
 * - 其他路径 → 交给静态资源绑定（SPA 路由回退到 index.html）
 */
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return c.json({ error: 'Not Found', path: pathname }, 404);
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
