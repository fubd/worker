/**
 * Generate the mainland-China variants of the HTML entry:
 *   dist/index-cn.html  (SPA shell for /todos, /about and unknown routes)
 *   dist/home-cn.html   (first-screen snapshot for /, if home.html exists)
 *
 * npmmirror's per-file /files/ endpoint is allowlisted and rejects new
 * packages, so the CN variant does not use a plain import map. Instead it
 * inlines scripts/cn-vendor-loader.ts, which fetches the npm tarball from
 * cdn.npmmirror.com, extracts React, ReactDOM, React Router and the initial
 * antd chunk, and registers blob: URLs in an import map before loading the app
 * entry. The app entry and CSS stay on deephos.com; the vendor and antd bytes
 * come from npmmirror.
 *
 * Run after `rsbuild build` and `first-screen` (which writes home.html).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { renderCnVendorLoader } from './cn-vendor-loader';
import {
  assertVendorPackageLocked,
  cnVendorTarball,
  VENDOR_PACKAGE,
} from './vendor-package-config';

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

/** 静态页没有 JS 菜单，隐藏点了没反应的折叠按钮。 */
const STATIC_HOME_STYLE = `<style id="swan-static-home-style">
  #swan-first-screen .swan-header button[aria-label="打开菜单"],
  #swan-first-screen .swan-header button[aria-label="收起菜单"] { display: none; }
</style>`;

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
  // 1. The app entry module scripts are injected by the loader after the import
  //    map exists; remove them from the parsed HTML so nothing resolves early.
  //    The antd chunk is intentionally not injected as a script: the entry chunk
  //    imports it relatively, and the loader remaps that URL to a blob.
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

  // 2. Remove the static import map and the same-origin vendor preloads.
  out = out.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
  if (out.includes('type="importmap"')) {
    throw new Error('CN HTML transform left a static import map behind');
  }
  out = out.replace(/<link rel="modulepreload" href="\/vendor\/[^"]+"\s*\/?>\s*/g, '');
  if (/<link rel="modulepreload" href="\/vendor\//.test(out)) {
    throw new Error('CN HTML transform left a /vendor modulepreload behind');
  }

  // 3. Mark the variant for probes and local tests.
  const variant = options.staticHome ? 'cn-static' : 'cn-npmmirror-tarball';
  out = out.replace(
    '<meta name="swan-vendor" content="global-static" />',
    `<meta name="swan-vendor" content="${variant}" />`,
  );

  if (options.staticHome) {
    // 静态首页（POC）：快照就是最终页面，不加载 React/antd，也不 hydrate。
    // 快照原本是 aria-hidden + inert 的"占位层"，这里改成真正的内容：
    // - 去掉 readiness 脚本（没有 app 可等）
    // - 去掉 #root（没有 app 可挂载）
    // - 去掉准备态属性，使快照对辅助技术和点击都可见
    out = out.replace(/<script id="swan-first-screen-ready">[\s\S]*?<\/script>\s*/i, '');
    out = out.replace(/\s*<div id="root"><\/div>/, '');
    out = out.replace(/\sdata-swan-first-screen="preparing"/, '');
    out = out.replace(
      '<div id="swan-first-screen" aria-hidden="true" inert>',
      '<div id="swan-first-screen">',
    );
    out = out.replace('</head>', `    ${STATIC_HOME_STYLE}\n  </head>`);
    out = out.replace('</body>', `    ${STATIC_HOME_SCRIPT}\n  </body>`);

    if (
      !out.includes('<div id="swan-first-screen">') ||
      !out.includes('id="swan-static-home-style"') ||
      !out.includes('id="swan-static-home-stats"') ||
      out.includes('swan-first-screen-ready') ||
      /<html[^>]*data-swan-first-screen="preparing"/.test(out) ||
      out.includes('<div id="root">')
    ) {
      throw new Error('CN static home transform did not apply');
    }
  } else {
    // 4. Start the tarball fetch as early as possible, and preload the app
    //    chunks in parallel. The HTTP cache is shared, so the module scripts
    //    injected by the loader can reuse these downloads.
    const tarball = cnVendorTarball();
    const hints = [
      '<link rel="preconnect" href="https://cdn.npmmirror.com" crossorigin />',
      `<link rel="preload" as="fetch" href="${tarball}" crossorigin="anonymous" />`,
      ...appScripts.map((src) => `<link rel="preload" as="script" href="${src}" crossorigin />`),
    ].join('\n    ');

    const loader = renderCnVendorLoader({
      tarballUrl: tarball,
      sha256: VENDOR_PACKAGE.tarballSha256,
      reactFile: files.react,
      domFile: files.dom,
      routerFile: files.router,
      antdFile: antd,
      appScripts,
    });

    out = out.replace('</head>', `    ${hints}\n    ${loader}\n  </head>`);
  }

  const expectVendor = options.staticHome
    ? 'content="cn-static"'
    : 'content="cn-npmmirror-tarball"';
  if (!out.includes(expectVendor)) {
    throw new Error('CN HTML transform did not apply; check the source template');
  }
  if (
    !options.staticHome &&
    (!out.includes('cdn.npmmirror.com') ||
      !out.includes('__SWAN_CN_VENDOR__') ||
      !out.includes(antd))
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
writeFileSync(`${DIST}/index-cn.html`, toCn(indexHtml, files, antd));

const homePath = `${DIST}/home.html`;
if (existsSync(homePath)) {
  writeFileSync(
    `${DIST}/home-cn.html`,
    toCn(readFileSync(homePath, 'utf8'), files, antd, { staticHome: true }),
  );
  console.log(
    `[cn-html] wrote dist/index-cn.html and static dist/home-cn.html (vendor tarball: ${cnVendorTarball()})`,
  );
} else {
  console.log(
    `[cn-html] wrote dist/index-cn.html (vendor tarball: ${cnVendorTarball()}); ` +
      'home.html missing, skipped home-cn.html',
  );
}
