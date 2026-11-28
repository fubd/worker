/**
 * Assemble the Vercel deployment. The public site lives at /, authentication
 * at /login, and the private workspace at /docs.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { BRAND } from '../src/shared/brand';

const DIST = 'dist';
const OUT = `${DIST}/vercel`;
const API_ORIGIN = 'https://api.deephos.com';
const WORKER_UPLOAD_ORIGIN = 'swan-worker.fubd.workers.dev';
const HOME_ORIGIN = 'https://api.deephos.com/home?fresh';
const APP_SHELL_EDGE_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const HOME_EDGE_CACHE = 'public, s-maxage=10, stale-while-revalidate=60';

const required = [
  'index.html',
  'login.html',
  'docs.html',
  'share.html',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'app-icon-512.png',
  'brand/logo-mark.svg',
];
for (const file of required) {
  if (!existsSync(`${DIST}/${file}`)) {
    throw new Error(`Vercel bundle is missing dist/${file}; run the static build first`);
  }
}

// Rsbuild owns dist/static and outputs here by default. Copy into the bundle
// so a freshly built Worker can keep serving it while the pages are assembled.
rmSync(`${OUT}/_home`, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of [
  'index.html',
  'login.html',
  'docs.html',
  'share.html',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'app-icon-512.png',
]) {
  cpSync(`${DIST}/${file}`, `${OUT}/${file}`);
}
cpSync(`${DIST}/brand`, `${OUT}/brand`, { recursive: true });
cpSync(`${DIST}/static`, `${OUT}/static`, { recursive: true });
mkdirSync(`${OUT}/_home`, { recursive: true });
const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
for (const file of ['visitor.html', 'member.html']) {
  writeFileSync(
    `${OUT}/_home/${file}`,
    readFileSync(`${DIST}/${file}`, 'utf8').replaceAll('__YUYAN_HOME_BUILD__', commit),
  );
}
for (const filename of ['visitor.html', 'member.html']) {
  const htmlPath = `${OUT}/${filename}`;
  writeFileSync(
    htmlPath,
    readFileSync(`${DIST}/${filename}`, 'utf8')
      .replaceAll('__YUYAN_HOME_BUILD__', commit)
      .replaceAll('https://api.deephos.com/_home/', `https://${WORKER_UPLOAD_ORIGIN}/_home/`)
      .replace('</head>', `  <meta name="yuyan-build" content="${commit}">\n  </head>`),
  );
}
if (!readFileSync(`${OUT}/login.html`, 'utf8').includes('swan-login-card')) {
  throw new Error('/login is missing its login form');
}
if (!readFileSync(`${OUT}/docs.html`, 'utf8').includes('swan-workspace-is-loading')) {
  throw new Error('/docs is missing its authentication shell');
}
if (!readFileSync(`${OUT}/share.html`, 'utf8').includes('swan-share-shell')) {
  throw new Error('/share is missing its public document shell');
}

const config = {
  redirects: [
    { source: '/todos', destination: '/docs', permanent: false },
    { source: '/about', destination: '/', permanent: false },
  ],
  rewrites: [
    { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    { source: '/', destination: HOME_ORIGIN },
    { source: '/login', destination: '/_home/login.html' },
    { source: '/docs', destination: '/_home/docs.html' },
    { source: '/docs/:path*', destination: '/_home/docs.html' },
    { source: '/share/:path*', destination: '/_home/share.html' },
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
      source: '/_home/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ],
      has: [{ type: 'cookie', key: 'yuyan_session' }],
    },
    {
      source: '/_home/visitor.html',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
    },
    ...['/login', '/docs', '/docs/:path*', '/share/:path*'].map((source) => ({
      source,
      headers: [{ key: 'CDN-Cache-Control', value: HOME_EDGE_CACHE }],
      has: [{ type: 'cookie', key: 'yuyan_session' }],
    })),
    {
      source: '/login',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
      ],
    },
    {
      source: '/docs',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
      ],
    },
    {
      source: '/docs/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
      ],
    },
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
      ],
    },
    {
      source: '/share/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: APP_SHELL_EDGE_CACHE },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    },
  ],
};
writeFileSync(`${OUT}/vercel.json`, `${JSON.stringify(config, null, 2)}\n`);

const notFound = `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>页面不存在 · ${BRAND.name}</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:48px;color:#0f172a">
  <p>页面不存在。</p>
  <p><a href="/">返回雨燕首页</a></p>
</body>
`;
writeFileSync(`${OUT}/404.html`, notFound);
writeFileSync(`${OUT}/_home/404.html`, notFound);

console.log('[vercel] wrote public, login, docs, and share entry pages');
