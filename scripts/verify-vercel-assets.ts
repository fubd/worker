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
  for (const match of content.matchAll(/\b(?:src|href)=["'](\/(?:static|favicon)[^"'?#]*)/g)) {
    const asset = match[1];
    if (!existsSync(join(OUT, asset.slice(1)))) {
      throw new Error(`${name} references missing Vercel asset ${asset}`);
    }
    checkedRefs += 1;
  }
}

console.log(`[vercel] verified ${checkedRefs} local static references`);
