import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

execFileSync(process.execPath, ['scripts/render-home.ts'], { stdio: 'inherit' });
const template = await import(new URL('../dist/server/home-template.mjs', import.meta.url).href);
if (!readFileSync('dist/server/home-template.mjs', 'utf8').includes('memberShell')) {
  throw new Error('home template render did not produce memberShell');
}
process.stdout.write(`[static] prepared ${template.memberShell.length} bytes of member home\n`);
renameSync('dist/server/home-template.mjs', 'dist/server/home-html.mjs');
writeFileSync(
  'dist/server/home-html.txt',
  `${template.visitorShell}\n<!----yuyan-member-home---->\n${template.memberShell}`,
);
