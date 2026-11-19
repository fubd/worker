/**
 * Generate the mainland-China static home page snapshot:
 *   dist/home-cn.html
 *
 * The snapshot contains all required markup and CSS inline, so it does not
 * request React, antd, or vendor modules. Every remaining runtime asset is
 * served by Vercel from deephos.com.
 *
 * /todos and /about intentionally use the same Vercel-hosted SPA shell for all
 * regions. This keeps every JS and CSS request same-origin.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { injectStaticSpeedInsights } from './static-speed-insights';
import { STATIC_MENU, STATIC_MENU_SCRIPT, STATIC_PAGE_STYLE } from './static-page';

const DIST = 'dist';
const SOURCE = `${DIST}/home.html`;
const OUTPUT = `${DIST}/home-cn.html`;

/**
 * The captured home page normally hands over to React. The CN variant keeps
 * the completed snapshot as the final page instead, because its dynamic stats
 * are updated with a small inline fetch.
 */
function toStaticHome(html: string): string {
  let out = html.replace(/<script type="module" src="\/static\/js\/[^"]+"><\/script>\s*/g, '');
  out = out.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
  out = out.replace(/<link rel="modulepreload" href="[^"]+"\s*\/?>\s*/gi, '');
  out = out.replace(/<script id="swan-first-screen-ready">[\s\S]*?<\/script>\s*/i, '');
  out = out.replace(/\s*<div id="root"><\/div>/, '');
  out = out.replace(/\sdata-swan-first-screen="preparing"/, '');
  out = out.replace(
    '<div id="swan-first-screen" aria-hidden="true">',
    '<div id="swan-first-screen">',
  );
  out = out.replaceAll(' tabindex="-1"', '');
  out = out.replace('</head>', `    ${STATIC_PAGE_STYLE}\n  </head>`);
  out = out.replace(
    '</body>',
    `    ${STATIC_MENU}\n    ${STATIC_HOME_SCRIPT}\n    ${STATIC_MENU_SCRIPT}\n  </body>`,
  );

  if (
    !out.includes('<div id="swan-first-screen">') ||
    !out.includes('id="swan-static-home-style"') ||
    !out.includes('id="swan-static-home-stats"') ||
    !out.includes('id="swan-static-home-menu"') ||
    !out.includes('id="swan-static-menu"') ||
    !out.includes('id="swan-static-backdrop"') ||
    out.includes('swan-first-screen-ready') ||
    /<html[^>]*data-swan-first-screen="preparing"/.test(out) ||
    out.includes('<div id="root">') ||
    /<script\b[^>]*type="module"/i.test(out) ||
    /<link\b[^>]*rel=["']modulepreload["']/i.test(out)
  ) {
    throw new Error('CN static home transform did not apply');
  }
  return out;
}

/**
 * Static homepage stats update after first paint. Failure leaves the build-time
 * values in place, so the page remains useful without JavaScript.
 */
const STATIC_HOME_SCRIPT = `<script id="swan-static-home-stats">
(function () {
  if (!window.fetch) return;
  function set(name, value) {
    var nodes = document.querySelectorAll('[data-swan-field="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = String(value);
  }
  window
    .fetch('/api/stats', { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (stats) {
      if (!stats || typeof stats.total !== 'number') return;
      set('total', stats.total);
      if (stats.active != null) set('active', stats.active);
      if (stats.completed != null) set('completed', stats.completed);
      if (typeof stats.completionRate === 'number') {
        set('completionRate', stats.completionRate + '%');
      }
      if (stats.runtime) set('runtime', stats.runtime);
      if (stats.database) set('database', stats.database);
      if (stats.region) set('region', stats.region);
    })
    .catch(function () {});
})();
</script>`;

if (!existsSync(SOURCE)) {
  throw new Error('dist/home.html is missing; run build:first-screen first');
}

const homeCn = injectStaticSpeedInsights(toStaticHome(readFileSync(SOURCE, 'utf8')));
if (!homeCn.includes('/_vercel/speed-insights/script.js')) {
  throw new Error('CN static home is missing Speed Insights');
}
writeFileSync(OUTPUT, homeCn);
console.log(`[cn-home] wrote ${OUTPUT}`);
