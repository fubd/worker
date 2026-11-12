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
 * 首页优先返回构建期生成的静态首屏快照（dist/home.html）。
 *
 * home.html 由 scripts/first-screen 在 rsbuild build 之后生成；缺失时
 * ASSETS 的 SPA 回退会返回 index.html，等价于旧行为。
 * 用 /home 而不是 /home.html：Workers 静态资源默认 html_handling=auto-trailing-slash，
 * 请求 /home.html 会被 307 到 /home。
 */
app.get('/', async (c) => {
  try {
    const home = await c.env.ASSETS.fetch(new URL('/home', c.req.url));
    if (home.ok) return home;
  } catch {
    // ASSETS 不可用（例如还没构建 dist）时继续走下面的 SPA 兜底
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

/** 快照文件只给 / 用；直接访问时回到首页，避免出现两份首页内容 */
app.get('/home', (c) => c.redirect('/', 301));
app.get('/home.html', (c) => c.redirect('/', 301));

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
 * - /api 未命中 → 返回 JSON 404
 * - 其他路径 → 交给静态资源绑定（SPA 路由回退到 index.html）
 *
 * /vendor/* 已不在 run_worker_first 里，由静态资源层直接托管；
 * 文件缺失时会命中 SPA 回退，这属于构建/importmap 不一致的部署错误。
 */
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return c.json({ error: 'Not Found', path: pathname }, 404);
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
