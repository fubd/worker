/**
 * Turn the statically rendered home page into a no-hydration variant for
 * mainland China. The markup is already complete; only live dashboard values
 * are refreshed with a small inline fetch.
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
  out = out.replace('</body>', `${STATIC_HOME_SCRIPT}\n  </body>`);

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
  throw new Error('dist/home.html is missing; run build:static first');
}

const homeCn = injectStaticSpeedInsights(toStaticHome(readFileSync(SOURCE, 'utf8')));
if (!homeCn.includes('/_vercel/speed-insights/script.js')) {
  throw new Error('CN static home is missing Speed Insights');
}
writeFileSync(OUTPUT, homeCn);
console.log(`[cn-home] wrote ${OUTPUT}`);
