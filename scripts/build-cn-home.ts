/**
 * Turn the statically rendered home page into a no-hydration variant for
 * mainland China. The markup is complete at build time, so this variant does
 * not load React or make a client-side stats request.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { injectStaticSpeedInsights } from './static-speed-insights';

const DIST = 'dist';
const SOURCE = `${DIST}/home.html`;
const OUTPUT = `${DIST}/home-cn.html`;

function toStaticHome(html: string): string {
  let out = html.replace(/\s*<script type="module" src="\/static\/js\/[^"]+"><\/script>/g, '');
  out = out.replace(/\s*<link rel="modulepreload" href="[^"]+"\s*\/?>/gi, '');
  out = out.replace(/\s*<script[^>]*>window\.__staticRouterHydrationData[\s\S]*?<\/script>/g, '');

  if (
    !out.includes('<div id="root">') ||
    !out.includes('class="swan-hero"') ||
    !out.includes('data-swan-field="total"') ||
    /<script\b[^>]*type=["']module["']/i.test(out) ||
    /<link\b[^>]*rel=["']modulepreload["']/i.test(out) ||
    out.includes('window.__staticRouterHydrationData')
  ) {
    throw new Error('CN static home transform did not apply');
  }
  return out;
}

if (!existsSync(SOURCE)) {
  throw new Error('dist/home.html is missing; run build:static first');
}

const homeCn = injectStaticSpeedInsights(toStaticHome(readFileSync(SOURCE, 'utf8')));
if (!homeCn.includes('/_vercel/speed-insights/script.js')) {
  throw new Error('CN static home is missing Speed Insights');
}
writeFileSync(OUTPUT, homeCn);
console.log(`[cn-home] wrote ${OUTPUT}`);
