/**
 * Generate the mainland-China variants of the HTML entry:
 *   dist/index-cn.html  (SPA shell for /todos, /about and unknown routes)
 *   dist/home-cn.html   (first-screen snapshot for /, if home.html exists)
 *
 * The CN variant uses a static import map pointing React / ReactDOM / React
 * Router at OSS /static/vendor/*; the app entry, async chunks, antd chunk and
 * CSS also live on OSS (see scripts/oss-config.ts). No npmmirror tarball,
 * loader, SHA check or blob URLs at runtime.
 *
 * Run after `rsbuild build` and `first-screen` (which writes home.html).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { injectLoadingShell } from './loading-shell';
import { apiPrefetchScript, routePreloadScript, todosRouteFiles } from './route-preload';
import { OSS_STATIC } from './oss-config';
import { assertVendorPackageLocked, VENDOR_PACKAGE } from './vendor-package-config';

const DIST = 'dist';
const VENDOR_DIR = `${DIST}/vendor`;
const STATIC_JS = `${DIST}/static/js`;

/**
 * 静态首页的渐进增强：只更新快照里的数字和运行时信息，不加载 React/antd。
 * 接口失败或没有 JS 时保留构建时的占位值。
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

/**
 * 静态首页的菜单：移动端面板 clone 快照里的真实 sider（logo + antd 菜单），
 * 宽度、遮罩和滑入动画对齐 /todos 的 Drawer（264px）；桌面端 sider 常驻，
 * 只隐藏点了没反应的「收起菜单」，并恢复被快照冻结的菜单 hover 过渡。
 */
const STATIC_HOME_STYLE = `<style id="swan-static-home-style">
  /* 静态首页就是最终页面：快照里的链接/按钮全部可点 */
  #swan-first-screen, #swan-first-screen * { pointer-events: auto; }
  #swan-first-screen .swan-header button[aria-label="收起菜单"] { display: none; }
  #swan-first-screen .swan-sider .ant-menu-item,
  #swan-first-screen .swan-sider .ant-menu-item * { transition: background-color 0.2s, color 0.2s !important; }
  #swan-static-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
  #swan-static-backdrop.is-open { opacity: 1; pointer-events: auto; }
  #swan-static-menu {
    position: fixed; top: 0; left: 0; bottom: 0; width: 264px; max-width: 82vw;
    background: #fff; z-index: 1000; box-shadow: 0 0 24px rgba(15, 23, 42, 0.18);
    transform: translateX(-100%); pointer-events: none; transition: transform 0.2s ease;
    overflow-y: auto;
  }
  #swan-static-menu.is-open { transform: translateX(0); pointer-events: auto; }
  #swan-static-menu .swan-sider { width: 100% !important; max-width: none !important; min-width: 0 !important; height: auto; border-right: 0; }
  /* 快照的移动视图里没有桌面 sider 的菜单样式，这里按 /todos 抽屉的实测值补齐 */
  #swan-static-menu .ant-menu,
  #swan-static-menu .ant-menu-item { list-style: none; }
  #swan-static-menu .ant-menu-item {
    height: var(--ant-menu-item-height, 40px);
    line-height: var(--ant-menu-item-height, 40px);
    margin: var(--ant-menu-item-margin, 4px);
    padding: 0 16px 0 24px;
    font-size: var(--ant-font-size, 14px);
    border-radius: var(--ant-menu-item-border-radius, 8px);
    color: var(--ant-color-text, rgba(0, 0, 0, 0.88));
  }
  #swan-static-menu .ant-menu-item .anticon { font-size: 14px; }
  #swan-static-menu .ant-menu-item .ant-menu-title-content { margin-inline-start: 10px; }
  #swan-static-menu .ant-menu-item a,
  #swan-first-screen .swan-sider .ant-menu-item a { color: var(--ant-color-text, rgba(0, 0, 0, 0.88)); }
  #swan-static-menu .ant-menu-item-selected { background-color: var(--ant-menu-item-selected-bg, #e6f4ff); }
  #swan-static-menu .ant-menu-item-selected,
  #swan-static-menu .ant-menu-item-selected .ant-menu-title-content,
  #swan-static-menu .ant-menu-item-selected a,
  #swan-first-screen .swan-sider .ant-menu-item-selected a { color: var(--ant-color-primary, #1677ff); }
  #swan-static-menu > a { display: block; padding: 10px 16px; color: #0f172a; font-size: 14px; text-decoration: none; }
</style>`;

const STATIC_HOME_MENU = `<div id="swan-static-backdrop"></div>
<nav id="swan-static-menu" aria-hidden="true" aria-label="站点导航"></nav>`;

const STATIC_HOME_MENU_SCRIPT = `<script id="swan-static-home-menu">
(function () {
  var btn = document.querySelector('#swan-first-screen .swan-header button[aria-label="打开菜单"]');
  var menu = document.getElementById('swan-static-menu');
  var backdrop = document.getElementById('swan-static-backdrop');
  if (!btn || !menu || !backdrop) return;
  var sider = document.querySelector('#swan-first-screen .swan-sider');
  if (sider) {
    var clone = sider.cloneNode(true);
    clone.removeAttribute('style');
    menu.appendChild(clone);
  } else {
    menu.innerHTML = '<a href="/">概览</a><a href="/todos">待办 Demo</a><a href="/about">技术栈</a>';
  }
  function set(open) {
    menu.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', function () { set(!menu.classList.contains('is-open')); });
  backdrop.addEventListener('click', function () { set(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') set(false); });
})();
</script>`;

function vendorFiles(): { react: string; dom: string; router: string } {
  const files = readdirSync(VENDOR_DIR);
  const pick = (pattern: RegExp, label: string) => {
    const match = files.find((file) => pattern.test(file));
    if (!match) throw new Error(`missing ${label} in ${VENDOR_DIR}`);
    return match;
  };

  return {
    react: pick(/^react-\d[^/]*\.mjs$/, 'react'),
    dom: pick(/^react-dom-[^/]*\.mjs$/, 'react-dom'),
    router: pick(/^router-[^/]*\.mjs$/, 'router'),
  };
}

function antdFile(): string {
  const files = readdirSync(STATIC_JS);
  const match = files.find((file) => /^lib-antd\.[^.]+\.mjs$/.test(file));
  if (!match) throw new Error(`missing lib-antd chunk in ${STATIC_JS}`);
  if (match !== VENDOR_PACKAGE.antdFile) {
    throw new Error(
      `built antd chunk is ${match}, but the CN vendor package contains ` +
        `${VENDOR_PACKAGE.antdFile}. Bump the package version, republish, and update ` +
        'scripts/vendor-package-config.ts before building the CN HTML.',
    );
  }
  return match;
}

function toCn(
  html: string,
  files: { react: string; dom: string; router: string },
  antd: string,
  options: { staticHome?: boolean } = {},
): string {
  // 1. 收集模块脚本：antd 由 entry 相对 import，不单独加载；其余 entry 脚本稍后按 OSS 地址重插。
  const allScripts: string[] = [];
  let out = html.replace(
    /<script type="module" src="(\/static\/js\/[^"]+)"><\/script>\s*/g,
    (_match, src: string) => {
      allScripts.push(src);
      return '';
    },
  );
  const antdScript = `/static/js/${antd}`;
  if (!allScripts.includes(antdScript)) {
    throw new Error(`CN HTML transform did not find ${antdScript}`);
  }
  const appScripts = allScripts.filter((src) => src !== antdScript);
  if (appScripts.length === 0) {
    throw new Error('CN HTML transform found no app entry module scripts');
  }

  const ossBase = OSS_STATIC.baseUrl;
  const vendorUrl = (file: string) => `${ossBase}/static/vendor/${file}`;

  // 2. 静态 import map：vendor 直接指向 OSS，不再需要 tarball loader。
  const importMap = {
    imports: {
      react: vendorUrl(files.react),
      'react/jsx-runtime': vendorUrl(files.react),
      'react-dom': vendorUrl(files.dom),
      'react-dom/client': vendorUrl(files.dom),
      'react-router': vendorUrl(files.router),
      'react-router/dom': vendorUrl(files.router),
    },
  };
  out = out.replace(
    /<script type="importmap">[\s\S]*?<\/script>\s*/i,
    `<script type="importmap">\n    ${JSON.stringify(importMap, null, 2)}\n    </script>\n`,
  );
  if (!out.includes('type="importmap"')) {
    throw new Error('CN HTML transform did not produce a static import map');
  }
  out = out.replace(/<link rel="modulepreload" href="\/vendor\/[^"]+"\s*\/?>\s*/g, '');
  if (/<link rel="modulepreload" href="\/vendor\//.test(out)) {
    throw new Error('CN HTML transform left a /vendor modulepreload behind');
  }

  // 3. Mark the variant for probes and local tests.
  const variant = options.staticHome ? 'cn-static' : 'cn-oss-importmap';
  out = out.replace(
    '<meta name="swan-vendor" content="global-static" />',
    `<meta name="swan-vendor" content="${variant}" />`,
  );

  // Static files live on OSS in the CN variant; paths match 1:1.
  out = out.replaceAll('href="/static/css/', `href="${ossBase}/static/css/`);

  if (options.staticHome) {
    // 静态首页（POC）：快照就是最终页面，不加载 React/antd，也不 hydrate。
    out = out.replace(/<script id="swan-first-screen-ready">[\s\S]*?<\/script>\s*/i, '');
    out = out.replace(/\s*<div id="root"><\/div>/, '');
    out = out.replace(/\sdata-swan-first-screen="preparing"/, '');
    out = out.replace(
      '<div id="swan-first-screen" aria-hidden="true">',
      '<div id="swan-first-screen">',
    );
    // 静态首页就是最终页面：恢复键盘访问（生成阶段为 hydrate 前加的 tabindex=-1 去掉）
    out = out.replaceAll(' tabindex="-1"', '');
    // 没有模块脚本，import map 也用不上，去掉省字节
    out = out.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
    out = out.replace('</head>', `    ${STATIC_HOME_STYLE}\n  </head>`);
    out = out.replace(
      '</body>',
      `    ${STATIC_HOME_MENU}\n    ${STATIC_HOME_SCRIPT}\n    ${STATIC_HOME_MENU_SCRIPT}\n  </body>`,
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
      out.includes('<div id="root">')
    ) {
      throw new Error('CN static home transform did not apply');
    }
  } else {
    // 4. preconnect OSS + vendor/antd modulepreload + /todos 路由 chunk 预加载；
    //    entry 用 OSS 绝对地址直接加载。
    const preloads = [files.react, files.dom, files.router]
      .map((file) => `<link rel="modulepreload" href="${vendorUrl(file)}" crossorigin />`)
      .join('\n    ');
    const antdPreload = `<link rel="modulepreload" href="${ossBase}/static/js/${antd}" crossorigin />`;
    const routeScripts =
      routePreloadScript(todosRouteFiles(DIST), `${ossBase}/static/js/async/`, true) +
      '\n    ' +
      apiPrefetchScript();
    out = out.replace(
      '</head>',
      `    <link rel="preconnect" href="${ossBase}" crossorigin />\n    ${preloads}\n    ${antdPreload}\n    ${routeScripts}\n  </head>`,
    );
    const scripts = appScripts
      .map((src) => `<script type="module" src="${ossBase}${src}"></script>`)
      .join('\n    ');
    out = out.replace('</body>', `    ${scripts}\n  </body>`);
  }

  const expectVendor = options.staticHome ? 'content="cn-static"' : 'content="cn-oss-importmap"';
  if (!out.includes(expectVendor)) {
    throw new Error('CN HTML transform did not apply; check the source template');
  }
  if (
    !options.staticHome &&
    (!out.includes(vendorUrl(files.react)) ||
      !out.includes(`${ossBase}${appScripts[0]}`) ||
      !out.includes(`${ossBase}/static/css/`) ||
      out.includes('cdn.npmmirror.com') ||
      out.includes('DecompressionStream') ||
      out.includes('href="/static/'))
  ) {
    throw new Error('CN HTML transform did not apply; check the source template');
  }
  if (out.includes(`<script type="module" src="${antdScript}">`)) {
    throw new Error('CN HTML transform left the antd script tag behind');
  }
  if (options.staticHome && /<script\b[^>]*type="module"/i.test(out)) {
    throw new Error('CN static home still contains a module script');
  }

  return out;
}

assertVendorPackageLocked();
const files = vendorFiles();
const antd = antdFile();
const indexHtml = readFileSync(`${DIST}/index.html`, 'utf8');
writeFileSync(`${DIST}/index-cn.html`, injectLoadingShell(toCn(indexHtml, files, antd)));

const homePath = `${DIST}/home.html`;
if (existsSync(homePath)) {
  writeFileSync(
    `${DIST}/home-cn.html`,
    toCn(readFileSync(homePath, 'utf8'), files, antd, { staticHome: true }),
  );
  console.log(`[cn-html] wrote dist/index-cn.html (OSS import map) and static dist/home-cn.html`);
} else {
  console.log(
    `[cn-html] wrote dist/index-cn.html (OSS import map); home.html missing, skipped home-cn.html`,
  );
}
