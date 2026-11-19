/**
 * Quick structural check for the final dist/about.html.
 *
 * Usage: bun scripts/check-static-about.ts [--strict]
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

const file = 'dist/about.html';
const strict = process.argv.includes('--strict');

if (!existsSync(file)) {
  const message = '[about-static] dist/about.html is missing; /about will use the SPA shell';
  if (strict) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const html = readFileSync(file, 'utf8');
const checks: Array<[string, boolean]> = [
  ['static container', html.includes('id="swan-first-screen"')],
  ['desktop variant', html.includes('swan-fs-desktop')],
  ['mobile variant', html.includes('swan-fs-mobile')],
  ['inline captured CSS', html.includes('id="swan-static-about-css"')],
  ['static menu', html.includes('id="swan-static-menu"')],
  ['about heading', html.includes('技术栈')],
  ['stack table content', html.includes('运行时 / 包管理')],
  ['Speed Insights route', html.includes('data-route="/about"')],
  ['no module scripts', !/<script\b[^>]*type=["']module["']/i.test(html)],
  ['no import map', !/<script\b[^>]*type=["']importmap["']/i.test(html)],
  ['no module preload', !/<link\b[^>]*rel=["']modulepreload["']/i.test(html)],
  ['no React root', !/<div\s+id=["']root["']/i.test(html)],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}

const size = statSync(file).size;
console.log(`size: ${size} bytes`);
process.exit(ok ? 0 : 1);
