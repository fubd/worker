import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { timing } from 'hono/timing';
import { authRoutes } from './routes/auth';
import { documentRoutes } from './routes/documents';
import { folderRoutes } from './routes/folders';
import type { AppEnv } from './types';

/**
 * 站点 HTML 与静态资源已由 Vercel 托管（deephos.com）；
 * Worker 只保留 api.deephos.com 上的 API，Vercel 通过 /api/* 反代过来。
 */
const app = new Hono<AppEnv>();

app.use('*', timing({ totalDescription: 'worker', crossOrigin: '*' }));
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

app.route('/api/auth', authRoutes);
app.route('/api/documents', documentRoutes);
app.route('/api/folders', folderRoutes);

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
