/**
 * 由 /about 的构建期抓取生成纯静态页 dist/about.html。
 *
 * 和首页快照不同：这里不 hydrate、不加载 React，快照就是最终页面；
 * 桌面 sider 是真实锚点，移动端由静态菜单脚本克隆 sider。
 */
import { writeFileSync } from 'node:fs';
import { STATIC_MENU, STATIC_MENU_SCRIPT, STATIC_PAGE_STYLE } from '../static-page';
import type { CaptureMap } from './capture';

const MOBILE_QUERY = '(max-width: 991.98px)';
const DESKTOP_QUERY = '(min-width: 992px)';

export function generateStaticPage(
  distDir: string,
  captures: CaptureMap,
  options: { title: string; description: string },
): number {
  const baseCss = `
html, body { margin: 0; }
html, body { background: var(--swan-bg, #f4f7fb); }
body { color: #0f172a; -webkit-font-smoothing: antialiased; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
.swan-fs-mobile { display: none; }
@media ${MOBILE_QUERY} {
  .swan-fs-desktop { display: none; }
  .swan-fs-mobile { display: block; }
}
#swan-first-screen { position: relative; z-index: 1; background: var(--swan-bg, #f4f7fb); }
#swan-first-screen *, #swan-first-screen *::before, #swan-first-screen *::after { animation: none !important; transition: none !important; }
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

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${options.description}" />
    <title>${options.title}</title>
    <style>${baseCss}${variantCss}</style>
    ${STATIC_PAGE_STYLE}
  </head>
  <body>
    ${STATIC_MENU}
    <div id="swan-first-screen">
      <div class="swan-fs-variant swan-fs-desktop">${captures.desktop.html}</div>
      <div class="swan-fs-variant swan-fs-mobile">${captures.mobile.html}</div>
    </div>
    ${STATIC_MENU_SCRIPT}
  </body>
</html>
`;

  writeFileSync(`${distDir}/about.html`, html);
  return Buffer.byteLength(html);
}

function escapeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}
