/**
 * Assemble the Vercel deployment. The product entry is /docs; legacy demo
 * routes redirect there, and browser API calls stay same-origin.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { BRAND } from '../src/shared/brand';

const DIST = 'dist';
const OUT = `${DIST}/vercel`;
const API_ORIGIN = 'https://api.deephos.com';
const APP_SHELL_EDGE_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const required = [
  'docs.html',
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

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of [
  'docs.html',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'app-icon-512.png',
]) {
  cpSync(`${DIST}/${file}`, `${OUT}/${file}`);
}
cpSync(`${DIST}/brand`, `${OUT}/brand`, { recursive: true });
cpSync(`${DIST}/static`, `${OUT}/static`, { recursive: true });

if (!readFileSync(`${OUT}/docs.html`, 'utf8').includes('swan-doc-list-panel')) {
  throw new Error('/docs is missing its product shell');
}

const config = {
  redirects: [
    { source: '/', destination: '/docs', permanent: false },
    { source: '/todos', destination: '/docs', permanent: false },
    { source: '/about', destination: '/docs', permanent: false },
  ],
  rewrites: [
    { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    { source: '/docs', destination: '/docs.html' },
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
      source: '/docs',
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
  ],
};
writeFileSync(`${OUT}/vercel.json`, `${JSON.stringify(config, null, 2)}\n`);

writeFileSync(
  `${OUT}/404.html`,
  `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>页面不存在 · ${BRAND.name}</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:48px;color:#0f172a">
  <p>页面不存在。</p>
  <p><a href="/docs">返回雨燕</a></p>
</body>
`,
);

console.log('[vercel] wrote dist/vercel for the /docs product shell');
