/**
 * Turn the captured DOM/CSS into dist/home.html.
 *
 * home.html is served only for "/" by the Worker. It contains:
 * - both responsive snapshots, switched by CSS media queries
 * - the snapshot CSS inline
 * - the app's global CSS inline when it is small (the default here), otherwise
 *   loaded asynchronously with a handover gate
 * - a tiny readiness script that removes the snapshot once the real app has
 *   rendered, and keeps it as a fallback if the app never becomes ready
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { CaptureMap } from './capture';

const MOBILE_QUERY = '(max-width: 991.98px)';
const DESKTOP_QUERY = '(min-width: 992px)';
const INLINE_CSS_LIMIT = 50_000;

export type AppCssMode = 'auto' | 'inline-css' | 'async' | 'blocking';

export type GenerateResult = {
  bytes: number;
  mode: Exclude<AppCssMode, 'auto'>;
  appCssBytes: number;
};

export function generateHomeHtml(
  distDir: string,
  captures: CaptureMap,
  requestedMode: AppCssMode = 'auto',
): GenerateResult {
  let html = readFileSync(`${distDir}/index.html`, 'utf8');

  const cssHrefs = stylesheetHrefs(html);
  const appCss = cssHrefs.map((href) => readFileSync(`${distDir}${href}`, 'utf8'));
  const canInline =
    appCss.length > 0 &&
    appCss.every(
      (css) => css.length <= INLINE_CSS_LIMIT && !/url\s*\(/i.test(css) && !/@import/i.test(css),
    );

  const mode: Exclude<AppCssMode, 'auto'> =
    requestedMode !== 'auto'
      ? requestedMode
      : appCss.length === 0
        ? 'blocking'
        : canInline
          ? 'inline-css'
          : 'async';

  const baseCss = `
html, body { margin: 0; }
html, body { background: var(--swan-bg, #f4f7fb); }
body { color: #0f172a; -webkit-font-smoothing: antialiased; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
html[data-swan-first-screen="preparing"] #root { visibility: hidden !important; position: absolute !important; inset: 0 !important; pointer-events: none !important; }
#swan-first-screen { position: relative; z-index: 1; background: var(--swan-bg, #f4f7fb); }
#swan-first-screen *, #swan-first-screen *::before, #swan-first-screen *::after { animation: none !important; transition: none !important; }
.swan-fs-mobile { display: none; }
@media ${MOBILE_QUERY} {
  .swan-fs-desktop { display: none; }
  .swan-fs-mobile { display: block; }
}
`;

  // The snapshot is rendered outside #root, so selectors that start at #root
  // need to be rebound to the snapshot container.
  const desktopCss = escapeCss(captures.desktop.css.replace(/#root\b/g, '#swan-first-screen'));
  const mobileCss = escapeCss(captures.mobile.css.replace(/#root\b/g, '#swan-first-screen'));

  const variantCss = `
@media ${DESKTOP_QUERY} {
${desktopCss}
}
@media ${MOBILE_QUERY} {
${mobileCss}
}
`;

  const snapshotHtml = `<div id="swan-first-screen" aria-hidden="true" inert>
  <div class="swan-fs-variant swan-fs-desktop">${captures.desktop.html}</div>
  <div class="swan-fs-variant swan-fs-mobile">${captures.mobile.html}</div>
</div>`;

  const readinessScript = `<script>
(function () {
  var done = false;
  var start = performance.now();
  var timedOut = false;
  performance.mark('swan:first-screen:static-visible');

  function ready() {
    if (typeof window.__swanAppCssPending === 'number' && window.__swanAppCssPending > 0) return false;
    return !!(document.querySelector('#root .swan-hero h1') &&
              document.querySelector('#root .swan-stat-value') &&
              document.querySelector('#root .swan-code-block'));
  }

  // The snapshot and the app are captured from the same tree, so a hard cut
  // is seamless and avoids the blank frame a fade would show: the snapshot
  // is in normal flow, not an overlay.
  function reveal() {
    if (done) return;
    done = true;
    performance.mark('swan:first-screen:complete');
    var el = document.getElementById('swan-first-screen');
    var style = document.getElementById('swan-first-screen-style');
    if (el) el.remove();
    if (style) style.remove();
    document.documentElement.removeAttribute('data-swan-first-screen');
  }

  function check() {
    if (done) return true;
    if (location.pathname !== '/') { reveal(); return true; }
    if (!ready()) return false;
    requestAnimationFrame(function () {
      requestAnimationFrame(reveal);
    });
    return true;
  }

  function tick() {
    if (done) return;
    if (check()) return;
    if (!timedOut && performance.now() - start > 10000) {
      timedOut = true;
      console.warn('[swan] first-screen snapshot kept as fallback: app not ready after 10s');
    }
    if (timedOut) setTimeout(tick, 500);
    else requestAnimationFrame(tick);
  }

  tick();
})();
</script>`;

  html = replaceStylesheetLinks(html, (href, index) => {
    if (mode === 'inline-css') {
      return `<style data-swan-app-css>${escapeCss(appCss[index] ?? '')}</style>`;
    }
    if (mode === 'async') {
      return (
        `<link rel="preload" as="style" href="${href}" ` +
        `onload="this.onload=null;this.rel='stylesheet';if(window.__swanAppCssPending>0)window.__swanAppCssPending--" ` +
        `onerror="if(window.__swanAppCssPending>0)window.__swanAppCssPending--">` +
        `<noscript><link rel="stylesheet" href="${href}"></noscript>`
      );
    }
    return `<link href="${href}" rel="stylesheet">`;
  });

  if (mode === 'async' && cssHrefs.length > 0) {
    // The counter must exist before the preload links can fire onload.
    html = html.replace(
      /<head\b[^>]*>/i,
      (tag) => `${tag}\n    <script>window.__swanAppCssPending=${cssHrefs.length};</script>`,
    );
  }

  html = html.replace(/<html\b([^>]*)>/i, (match, attrs: string) => {
    if (/\bdata-swan-first-screen=/.test(attrs)) return match;
    return `<html${attrs} data-swan-first-screen="preparing">`;
  });

  html = html.replace(
    '</head>',
    `  <style id="swan-first-screen-style">${baseCss}${variantCss}</style>\n</head>`,
  );

  const rootTag = '<div id="root"></div>';
  if (!html.includes(rootTag)) {
    throw new Error('dist/index.html does not contain <div id="root"></div>');
  }
  html = html.replace(rootTag, `${snapshotHtml}\n    ${rootTag}\n    ${readinessScript}`);

  if (!html.includes('id="swan-first-screen"') || !html.includes('id="swan-first-screen-style"')) {
    throw new Error('snapshot injection failed');
  }

  writeFileSync(`${distDir}/home.html`, html);

  return {
    bytes: Buffer.byteLength(html),
    mode,
    appCssBytes: appCss.reduce((sum, css) => sum + Buffer.byteLength(css), 0),
  };
}

function stylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel="stylesheet"/i.test(tag)) continue;
    const href = tag.match(/\bhref="([^"]+\.css)"/i)?.[1];
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function replaceStylesheetLinks(
  html: string,
  transform: (href: string, index: number) => string,
): string {
  let index = 0;
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel="stylesheet"/i.test(tag)) return tag;
    const href = tag.match(/\bhref="([^"]+\.css)"/i)?.[1];
    if (!href) return tag;
    return transform(href, index++);
  });
}

function escapeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}
