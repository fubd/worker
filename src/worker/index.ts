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

/**
 * react 系 vendor 模块的同源出口。
 *
 * 经 Worker 转发而不是直接暴露 R2 公有域名，是为了三件事：
 * - 同源：省掉第二个域名的 DNS/TCP/TLS，也避开内网网关对外域名的拦截
 * - 压缩：R2 直连不压缩，Worker 响应由 Cloudflare 按 Content-Type 压
 * - CORS：同源请求不需要 Access-Control-Allow-Origin
 * 文件名带 react 版本号，内容变了必然改名，所以可以放心 immutable 长缓存。
 */
app.get('/vendor/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/vendor/'.length));

  // 只允许桶根目录下的直接文件名，挡掉路径穿越
  if (!key || key.includes('/') || key.includes('..')) {
    return c.notFound();
  }

  const object = await c.env.VENDOR.get(key);
  if (!object) {
    return c.notFound();
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
    },
  });
});

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
 * - /api 与 /vendor 未命中 → 返回 JSON 404（不能让 SPA 回退把 index.html 当模块返回）
 * - 其他路径 → 交给静态资源绑定（SPA 路由回退到 index.html）
 */
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return c.json({ error: 'Not Found', path: pathname }, 404);
  }

  if (pathname.startsWith('/vendor/')) {
    return c.json({ error: 'Not Found', path: pathname }, 404);
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
