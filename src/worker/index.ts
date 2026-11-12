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
 * 是否中国大陆访问。cf.country 是 Cloudflare 的国家级 GeoIP（ISO 3166-1），
 * 适合做性能分流，不用于合规判断：VPN、企业出口、港澳台、XX/T1 都可能不是 CN。
 * 非 CN 一律走全球版；本地 wrangler dev 没有 cf 对象时用 CF-IPCountry 头模拟。
 */
function isMainland(req: Request): boolean {
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  const header = req.headers.get('CF-IPCountry');

  // 线上 Cloudflare 一定会加 cf-ray，且会覆盖客户端传入的 CF-IPCountry；
  // 此时只信 cf.country，避免被伪造头绕过。wrangler dev 没有 cf-ray，
  // 允许用 CF-IPCountry 头模拟大陆/海外探针。
  if (!req.headers.get('cf-ray') && header) return header === 'CN';
  return cf?.country === 'CN';
}

/**
 * 给 HTML 响应打上分流标记，方便探针确认命中了哪套 HTML。
 * CN 版必须 private/no-store：/ 和 /todos 是同一个 URL，不能让边缘缓存
 * 把 CN 的 HTML 发给海外用户（反之亦然）。
 */
function variantResponse(res: Response, variant: string, cn: boolean): Response {
  if (!res.ok) return res;

  const out = new Response(res.body, res);
  out.headers.set('x-swan-vendor', variant);
  out.headers.set('Vary', 'CF-IPCountry');
  if (cn) out.headers.set('Cache-Control', 'private, no-store');
  return out;
}

/**
 * 首页优先返回构建期生成的静态首屏快照。
 *
 * 大陆用户优先 dist/home-cn.html（vendor 指向 npmmirror），
 * 其他用户用 dist/home.html（vendor 指向同源 /vendor/*）。
 * 快照缺失时逐级回退到 /home 和 SPA shell。
 * 用 /home-cn 而不是 /home-cn.html：html_handling=auto-trailing-slash
 * 会把 .html 请求 307 到无后缀路径。
 */
app.get('/', async (c) => {
  const cn = isMainland(c.req.raw);
  // CN 优先首屏快照，其次全球快照，最后 CN SPA shell（CI 没 Chrome 时
  // home-cn.html 会被跳过，但 index-cn.html 仍然会生成）。
  const candidates = cn ? ['/home-cn', '/home', '/index-cn'] : ['/home'];

  for (const path of candidates) {
    try {
      const asset = await c.env.ASSETS.fetch(new URL(path, c.req.url));
      if (asset.ok) {
        const variant =
          path === '/home-cn' || path === '/index-cn' ? 'cn' : cn ? 'cn-fallback' : 'global';
        return variantResponse(asset, variant, cn);
      }
    } catch {
      // ASSETS 不可用（例如还没构建 dist）时继续尝试下一个候选
    }
  }

  try {
    return variantResponse(
      await c.env.ASSETS.fetch(c.req.raw),
      cn ? 'cn-shell-fallback' : 'global-shell-fallback',
      cn,
    );
  } catch {
    return c.text('Not Found', 404);
  }
});

/** 快照文件只给 / 用；直接访问时回到首页，避免出现两份首页内容 */
app.get('/home', (c) => c.redirect('/', 301));
app.get('/home.html', (c) => c.redirect('/', 301));
app.get('/home-cn', (c) => c.redirect('/', 301));
app.get('/home-cn.html', (c) => c.redirect('/', 301));

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
app.notFound(async (c) => {
  const { pathname } = new URL(c.req.url);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return c.json({ error: 'Not Found', path: pathname }, 404);
  }

  const cn = isMainland(c.req.raw);
  if (cn) {
    try {
      // 大陆 SPA 路由（/todos、/about、未知路径）用 CN importmap 的 shell
      const shell = await c.env.ASSETS.fetch(new URL('/index-cn', c.req.url));
      if (shell.ok) return variantResponse(shell, 'cn', true);
    } catch {
      // 回退到普通 SPA shell
    }
  }

  return variantResponse(
    await c.env.ASSETS.fetch(c.req.raw),
    cn ? 'cn-shell-fallback' : 'global',
    cn,
  );
});

export default app;
