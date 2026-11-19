import { readFileSync, writeFileSync } from 'node:fs';

import { injectStaticSpeedInsights } from '../static-speed-insights';
import { STATIC_MENU, STATIC_MENU_SCRIPT, STATIC_PAGE_STYLE } from '../static-page';
import type { CaptureMap } from './capture';

const MOBILE_QUERY = '(max-width: 991.98px)';
const DESKTOP_QUERY = '(min-width: 992px)';

export type AboutGenerateResult = {
  bytes: number;
};

export function generateAboutHtml(distDir: string, captures: CaptureMap): AboutGenerateResult {
  let html = readFileSync(`${distDir}/index.html`, 'utf8');

  html = html.replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
  html = html.replace(/<script\b[^>]*type=["']importmap["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
  html = html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '');
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>\s*/gi, '');

  const baseCss = `
html, body { margin: 0; }
html, body { background: var(--swan-bg, #f4f7fb); }
body { color: #0f172a; -webkit-font-smoothing: antialiased; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
#swan-first-screen { position: relative; min-height: 100vh; background: var(--swan-bg, #f4f7fb); }
#swan-first-screen *, #swan-first-screen *::before, #swan-first-screen *::after { animation: none !important; transition: none !important; }
.swan-fs-mobile { display: none; }
@media ${MOBILE_QUERY} {
  .swan-fs-desktop { display: none; }
  .swan-fs-mobile { display: block; }
}
`;

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

  html = html.replace(
    '</head>',
    `  <style id="swan-static-about-css">${baseCss}${variantCss}</style>
    ${STATIC_PAGE_STYLE}
  </head>`,
  );

  const rootTag = '<div id="root"></div>';
  if (!html.includes(rootTag)) {
    throw new Error('dist/index.html does not contain <div id="root"></div>');
  }
  const snapshot = `<div id="swan-first-screen">
  <div class="swan-fs-variant swan-fs-desktop">${captures.desktop.html}</div>
  <div class="swan-fs-variant swan-fs-mobile">${captures.mobile.html}</div>
</div>`;
  html = html.replace(rootTag, snapshot);
  html = html.replace('</body>', `  ${STATIC_MENU}\n  ${STATIC_MENU_SCRIPT}\n</body>`);
  html = injectStaticSpeedInsights(html, '/about');

  if (
    !html.includes('id="swan-first-screen"') ||
    !html.includes('id="swan-static-about-css"') ||
    !html.includes('id="swan-static-home-menu"') ||
    !html.includes('id="swan-static-menu"') ||
    !html.includes('id="swan-static-backdrop"') ||
    !html.includes('data-route="/about"') ||
    /<script\b[^>]*type=["']module["']/i.test(html) ||
    /<script\b[^>]*type=["']importmap["']/i.test(html) ||
    /<link\b[^>]*rel=["']modulepreload["']/i.test(html) ||
    /<div\s+id=["']root["']/i.test(html)
  ) {
    throw new Error('static about transform did not apply');
  }

  writeFileSync(`${distDir}/about.html`, html);
  return { bytes: Buffer.byteLength(html) };
}

function escapeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}
