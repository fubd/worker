import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { statsRoutes } from './routes/stats';
import { todoRoutes } from './routes/todos';
import type { AppEnv } from './types';

/**
 * 站点 HTML 与静态资源已由 Vercel 托管（deephos.com）；
 * Worker 只保留 api.deephos.com 上的 API，Vercel 通过 /api/* 反代过来。
 */
const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const startedAt = performance.now();
  c.set('dbMs', 0);

  await next();

  const workerMs = performance.now() - startedAt;
  const dbMs = c.get('dbMs');
  c.header('Server-Timing', `worker;dur=${workerMs.toFixed(1)}, db;dur=${dbMs.toFixed(1)}`);
  c.header('Timing-Allow-Origin', '*');

  console.log(
    JSON.stringify({
      event: 'worker_request',
      method: c.req.method,
      route: c.req.matchedRoutes.at(-1)?.path ?? new URL(c.req.url).pathname,
      status: c.res.status,
      cfRay: c.req.header('cf-ray') ?? null,
      workerMs: Number(workerMs.toFixed(1)),
      dbMs: Number(dbMs.toFixed(1)),
    }),
  );
});
app.use(
  '/api/*',
  cors({
    exposeHeaders: ['Server-Timing'],
  }),
);
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('CDN-Cache-Control', 'no-store');
});

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

/** 直接访问 API 域名根路径时回到主站 */
app.get('/', (c) => c.redirect('https://deephos.com/', 301));

/** 统一错误处理：细节只进日志，响应里不暴露内部信息 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const rayId = c.req.header('cf-ray') ?? 'local';
  console.error(`[worker] unhandled error (ray=${rayId}):`, err);

  return c.json({ error: 'Internal Server Error', traceId: rayId }, 500);
});

app.notFound((c) => {
  const { pathname } = new URL(c.req.url);
  return c.json({ error: 'Not Found', path: pathname }, 404);
});

export default app;
