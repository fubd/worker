/**
 * 生成 Vercel 全站产物：dist/vercel/
 *
 * deephos.com 整站由 Vercel 托管（Cloudflare 提供 api.deephos.com）：
 * - `/` 按 x-vercel-ip-country 分流：CN 用静态快照 home-cn.html，其他用 home.html；
 * - `/todos`、`/about` 同理：CN 用 index-cn.html（OSS + 静态 import map），其他用 shell-global.html（同源 vendor）；
 * - 新版本浏览器直连 api.deephos.com；保留 `/api/*` rewrite 兼容旧 HTML；
 * - static/vendor 随部署上传，供全球版使用；CN 的 JS/CSS 仍在 OSS。
 *
 * 地理分流用 vercel.json 的 `has: x-vercel-ip-country`，实测边缘缓存按变体隔离。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { injectLoadingShell } from './loading-shell';
import {
  findAntdFile,
  injectApiPrefetch,
  routePreloadScript,
  todosRouteFiles,
} from './route-preload';

const DIST = 'dist';
const OUT = `${DIST}/vercel`;
const LEGACY_API = 'https://api.deephos.com';

const required = ['index.html', 'home.html', 'home-cn.html', 'index-cn.html', 'favicon.svg'];
// index.html 必须改名：部署里存在 index.html 时 / 会直接命中静态文件，rewrite 不生效。
const GLOBAL_SHELL = 'shell-global.html';
for (const file of required) {
  if (!existsSync(`${DIST}/${file}`)) {
    throw new Error(
      `vercel bundle missing dist/${file}; run build:first-screen and build:cn-html first`,
    );
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const file of required.filter((f) => f !== 'index.html'))
  cpSync(`${DIST}/${file}`, `${OUT}/${file}`);
const globalShell = injectLoadingShell(
  injectApiPrefetch(readFileSync(`${DIST}/index.html`, 'utf8')),
).replace(
  '</head>',
  `    <link rel="modulepreload" href="/static/js/${findAntdFile(DIST)}" />\n` +
    `    ${routePreloadScript(todosRouteFiles(DIST), '/static/js/async/', false)}\n` +
    `  </head>`,
);
const prefetchIndex = globalShell.indexOf('id="swan-api-prefetch"');
const appModuleIndex = globalShell.indexOf('<script type="module" src="/static/js/index.');
if (prefetchIndex < 0 || appModuleIndex < 0 || prefetchIndex > appModuleIndex) {
  throw new Error('API prefetch must run before the app module');
}
writeFileSync(`${OUT}/${GLOBAL_SHELL}`, globalShell);
for (const dir of ['static', 'vendor']) {
  cpSync(`${DIST}/${dir}`, `${OUT}/${dir}`, { recursive: true });
}

const CN = [{ type: 'header', key: 'x-vercel-ip-country', value: 'CN' }];
const config = {
  rewrites: [
    // Older HTML is cached at the edge. Keep its same-origin API path working
    // during the transition; new builds use api.deephos.com directly.
    { source: '/api/:path*', destination: `${LEGACY_API}/api/:path*` },
    { source: '/', has: CN, destination: '/home-cn.html' },
    { source: '/', destination: '/home.html' },
    { source: '/todos', has: CN, destination: '/index-cn.html' },
    { source: '/todos', destination: `/${GLOBAL_SHELL}` },
    { source: '/about', has: CN, destination: '/index-cn.html' },
    { source: '/about', destination: `/${GLOBAL_SHELL}` },
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
