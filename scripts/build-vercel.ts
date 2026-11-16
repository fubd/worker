/**
 * 生成 Vercel 托管的 CN 首页产物：dist/vercel/
 *
 * Cloudflare 的大陆边缘常年落到美西/欧洲，首页 HTML 的跨境 RTT 是最后一段
 * 瓶颈。大陆 `/` 由 Worker 302 到 cn.deephos.com，HTML 交给 Vercel 的新加坡/
 * 东京节点；本脚本把 home-cn.html 改成可以在独立子域上直接用的版本：
 *
 * - 站内绝对路径（/todos、/about、/）指回主域，避免在子域上 404；
 * - /api/stats 走主域绝对地址（Worker 的 /api/* 已开 CORS）；
 * - 补 canonical，避免子域被搜索引擎当成重复首页；
 * - 404.html 兜底：直接访问子域其它路径时跳回主域对应路径。
 *
 * 产物只有 HTML，CSS/JS 仍在 OSS，vendor 走 npmmirror。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIST = 'dist';
const OUT = `${DIST}/vercel`;
const SITE = 'https://deephos.com';

const homePath = `${DIST}/home-cn.html`;
if (!existsSync(homePath)) {
  console.log('[vercel] home-cn.html missing, skipped dist/vercel');
  process.exit(0);
}

let html = readFileSync(homePath, 'utf8');
html = html.replaceAll('href="/', `href="${SITE}/`);
html = html.replaceAll("fetch('/api/stats'", `fetch('${SITE}/api/stats'`);
html = html.replace('</head>', `    <link rel="canonical" href="${SITE}/" />\n  </head>`);

if (/href="\/(?!\/)/.test(html)) {
  throw new Error('vercel bundle still has a site-relative href');
}
if (html.includes("fetch('/api/stats'")) {
  throw new Error('vercel bundle still has a relative stats fetch');
}
if (!html.includes(`${SITE}/api/stats`) || !html.includes('rel="canonical"')) {
  throw new Error('vercel bundle rewrite did not apply');
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
writeFileSync(
  `${OUT}/404.html`,
  `<!doctype html>
<meta charset="utf-8" />
<title>Redirecting…</title>
<meta name="robots" content="noindex" />
<script>
location.replace(${JSON.stringify(SITE)} + location.pathname + location.search + location.hash);
</script>
<p><a href="${SITE}/">返回 deephos.com</a></p>
`,
);
console.log('[vercel] wrote dist/vercel/index.html and 404.html');
