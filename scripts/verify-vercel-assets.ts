/**
 * Fail the build if the Vercel bundle still depends on an external static
 * origin or references a local static file that was not copied.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const OUT = 'dist/vercel';
const TEXT_EXTENSIONS = new Set(['.html', '.json', '.mjs', '.css', '.svg']);
const FORBIDDEN = ['aliyuncs.com', 'oss-cn-', 'cdn.npmmirror.com'];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

if (!existsSync(`${OUT}/static`)) {
  throw new Error('Vercel bundle is missing static/');
}

const homeHtml = readFileSync(`${OUT}/visitor.html`, 'utf8');
const memberHtml = readFileSync(`${OUT}/member.html`, 'utf8');
if (!homeHtml.includes('开始写作') || !memberHtml.includes('进入文档')) {
  throw new Error('homepage variants do not contain the resolved action');
}
for (const html of [homeHtml, memberHtml]) {
  if (
    !html.includes('swan-home-hero') ||
    !html.includes('让文字') ||
    !html.includes('name="yuyan-build"') ||
    html.includes('__YUYAN_HOME_BUILD__')
  ) {
    throw new Error('/ is missing its complete public homepage');
  }
}

const loginHtml = readFileSync(`${OUT}/login.html`, 'utf8');
if (!loginHtml.includes('swan-login-card') || !loginHtml.includes('继续写作')) {
  throw new Error('/login is missing its login form');
}

const docsHtml = readFileSync(`${OUT}/docs.html`, 'utf8');
if (!docsHtml.includes('swan-workspace-is-loading')) {
  throw new Error('/docs is missing its authentication shell');
}

const config = JSON.parse(readFileSync(`${OUT}/vercel.json`, 'utf8')) as {
  redirects?: Array<{ source?: string; destination?: string }>;
  rewrites?: Array<{ source?: string; destination?: string }>;
  headers?: Array<{ source?: string; has?: Array<{ type?: string; key?: string }> }>;
};

if (
  !config.rewrites?.some(
    (item) =>
      item.source === '/' &&
      typeof item.destination === 'string' &&
      item.destination.startsWith('https://api.deephos.com/home'),
  )
) {
  throw new Error('the homepage is missing its server session rewrite');
}
for (const path of ['/login', '/docs', '/docs/:path*']) {
  if (
    !config.headers?.some(
      (header) =>
        header.source === path &&
        header.has?.some(
          (condition) => condition.type === 'cookie' && condition.key === 'yuyan_session',
        ),
    )
  ) {
    throw new Error(`${path} may serve a cached page to a member`);
  }
}
if (!config.redirects?.some((item) => item.source === '/todos' && item.destination === '/docs')) {
  throw new Error('/todos is missing its /docs redirect');
}
if (!config.redirects?.some((item) => item.source === '/about' && item.destination === '/')) {
  throw new Error('/about is missing its homepage redirect');
}
for (const [source, destination] of [
  ['/login', '/_home/login.html'],
  ['/docs', '/_home/docs.html'],
  ['/docs/:path*', '/_home/docs.html'],
]) {
  if (
    !config.rewrites?.some((item) => item.source === source && item.destination === destination)
  ) {
    throw new Error(`${source} is missing its ${destination} rewrite`);
  }
}

const files = walk(OUT);
let checkedRefs = 0;

for (const file of files) {
  if (!TEXT_EXTENSIONS.has(extname(file))) continue;
  const content = readFileSync(file, 'utf8');
  const name = relative(OUT, file);

  for (const origin of FORBIDDEN) {
    if (content.includes(origin)) {
      throw new Error(`${name} still references external static origin ${origin}`);
    }
  }

  if (extname(file) !== '.html') continue;
  for (const match of content.matchAll(
    /\b(?:src|href)=["'](\/(?:static|favicon|brand|apple-touch-icon|app-icon)[^"'?#]*)/g,
  )) {
    const asset = match[1];
    if (!existsSync(join(OUT, asset.slice(1)))) {
      throw new Error(`${name} references missing Vercel asset ${asset}`);
    }
    checkedRefs += 1;
  }
}

console.log(`[vercel] verified ${checkedRefs} local static references`);
