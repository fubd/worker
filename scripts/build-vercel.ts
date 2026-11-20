/**
 * 生成 Vercel 全站产物：dist/vercel/
 *
 * deephos.com 整站由 Vercel 托管（Cloudflare 提供 api.deephos.com）：
 * - `/` 按 x-vercel-ip-country 分流：CN 用静态快照 home-cn.html，其他用 home.html；
 * - `/about` 使用构建期生成的最终静态页；
 * - `/todos` 使用 shell-global.html，所有 JS/CSS 同源加载；
 * - 浏览器统一请求 deephos.com/api/*，由 Vercel 代理到 api.deephos.com；
 * - static/vendor 随 Vercel 部署上传，不依赖外部静态资源域名。
 *
 * 地理分流用 vercel.json 的 `has: x-vercel-ip-country`，实测边缘缓存按变体隔离。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { inlineAppCss } from './inline-app-css';
import { injectLoadingShell } from './loading-shell';
import { injectTodosSnapshot } from './todos-bootstrap';
import { readTodosSnapshot } from './todos-snapshot';

const DIST = 'dist';
const OUT = `${DIST}/vercel`;
const LEGACY_API = 'https://api.deephos.com';
const APP_SHELL_EDGE_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const required = ['index.html', 'home.html', 'home-cn.html', 'favicon.svg'];
const hasStaticAbout = existsSync(`${DIST}/about.html`);
// index.html 必须改名：部署里存在 index.html 时 / 会直接命中静态文件，rewrite 不生效。
const GLOBAL_SHELL = 'shell-global.html';
for (const file of required) {
  if (!existsSync(`${DIST}/${file}`)) {
    throw new Error(
      `vercel bundle missing dist/${file}; run build:first-screen and build:cn-home first`,
    );
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const copied = [...required.filter((f) => f !== 'index.html')];
if (hasStaticAbout) copied.push('about.html');
for (const file of copied) cpSync(`${DIST}/${file}`, `${OUT}/${file}`);
const todosSnapshot = readTodosSnapshot(DIST);
const globalShell = injectLoadingShell(
  injectTodosSnapshot(
    inlineAppCss(readFileSync(`${DIST}/index.html`, 'utf8'), DIST),
    todosSnapshot,
  ),
  todosSnapshot,
);
writeFileSync(`${OUT}/${GLOBAL_SHELL}`, globalShell);
for (const dir of ['static', 'vendor']) {
  cpSync(`${DIST}/${dir}`, `${OUT}/${dir}`, { recursive: true });
}

const CN = [{ type: 'header', key: 'x-vercel-ip-country', value: 'CN' }];
const config = {
  rewrites: [
    // Keep API requests on the same origin so mainland browsers connect to
    // Vercel's Asia edge instead of being routed directly to a distant
    // Cloudflare PoP.
    { source: '/api/:path*', destination: `${LEGACY_API}/api/:path*` },
    { source: '/', has: CN, destination: '/home-cn.html' },
    { source: '/', destination: '/home.html' },
    { source: '/todos', destination: `/${GLOBAL_SHELL}` },
    { source: '/about', destination: hasStaticAbout ? '/about.html' : `/${GLOBAL_SHELL}` },
  ],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
    {
      source: '/static/:path*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/vendor/:path*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      // The shell is static for a deployment and embeds a data snapshot. Let
      // Vercel serve it from the nearest edge while browsers revalidate.
      source: '/todos',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
      ],
    },
    {
      source: '/about',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
      ],
    },
    {
      // API responses contain live runtime or database state. The build-time
      // snapshot is only a first-paint placeholder and must never become a
      // CDN cache.
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
      ],
    },
  ],
};
writeFileSync(`${OUT}/vercel.json`, `${JSON.stringify(config, null, 2)}\n`);

writeFileSync(
  `${OUT}/404.html`,
  `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>页面不存在 · Swan Worker</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:48px;color:#0f172a">
  <p>页面不存在。</p>
  <p><a href="/">返回首页</a></p>
</body>
`,
);

console.log('[vercel] wrote dist/vercel (full site + vercel.json)');
