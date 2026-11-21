/**
 * Fail the build if the Vercel bundle still depends on an external static
 * origin or references a local static file that was not copied into the
 * deployment.
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

const aboutHtml = readFileSync(`${OUT}/about.html`, 'utf8');
if (/<script\b[^>]*type=["']module["']/i.test(aboutHtml)) {
  throw new Error('/about must not load the React runtime');
}
if (!aboutHtml.includes('运行时 / 包管理') || !aboutHtml.includes('class="ant-table')) {
  throw new Error('/about is missing its static content');
}

const todosHtml = readFileSync(`${OUT}/todos.html`, 'utf8');
if (
  !todosHtml.includes('placeholder="要做什么？回车即可添加"') ||
  !todosHtml.includes('任务列表') ||
  !todosHtml.includes('id="swan-todos-snapshot"')
) {
  throw new Error('/todos is missing its React Router static content');
}

const docsHtml = readFileSync(`${OUT}/docs.html`, 'utf8');
if (!docsHtml.includes('swan-doc-list-panel') || !docsHtml.includes('>新建<')) {
  throw new Error('/docs is missing its React Router document shell');
}

const homeHtml = readFileSync(`${OUT}/home.html`, 'utf8');
if (!homeHtml.includes('class="swan-hero"') || homeHtml.includes('swan-first-screen')) {
  throw new Error('/ does not contain the React Router static home page');
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
