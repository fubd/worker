/**
 * Quick structural check for dist/home.html (no browser).
 *
 * Usage: bun scripts/first-screen/check.ts [--strict]
 *
 * Missing home.html is OK by default (the Worker falls back to the SPA shell);
 * --strict turns that into a failure for CI.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

const file = 'dist/home.html';
const strict = process.argv.includes('--strict');

if (!existsSync(file)) {
  const message = '[first-screen] dist/home.html is missing; / will use the SPA shell';
  if (strict) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const html = readFileSync(file, 'utf8');
const checks: Array<[string, RegExp]> = [
  ['snapshot container', /id="swan-first-screen"/],
  ['preparing attribute', /data-swan-first-screen="preparing"/],
  ['snapshot style', /id="swan-first-screen-style"/],
  ['readiness script', /swan:first-screen:complete/],
  ['app module script', /<script\b[^>]*type="module"/i],
  ['app css', /data-swan-app-css|rel="preload" as="style"|rel="stylesheet"/],
];

let ok = true;
for (const [name, pattern] of checks) {
  const pass = pattern.test(html);
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}

console.log(`size: ${statSync(file).size} bytes`);
process.exit(ok ? 0 : 1);
