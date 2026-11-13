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
  out = out.replace(
    '<meta name="swan-vendor" content="global-static" />',
    '<meta name="swan-vendor" content="cn-npmmirror-tarball" />',
  );

  // 4. Start the tarball fetch as early as possible, and preload the app
  //    chunks in parallel. The HTTP cache is shared, so the module scripts
  //    injected by the loader can reuse these downloads.
  const tarball = cnVendorTarball();
  const hints = [
    '<link rel="preconnect" href="https://cdn.npmmirror.com" crossorigin />',
    `<link rel="preload" as="fetch" href="${tarball}" crossorigin="anonymous" />`,
    ...appScripts.map((src) => `<link rel="preload" as="script" href="${src}" />`),
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

  if (
    !out.includes('content="cn-npmmirror-tarball"') ||
    !out.includes('cdn.npmmirror.com') ||
    !out.includes('__SWAN_CN_VENDOR__') ||
    !out.includes(antd)
  ) {
    throw new Error('CN HTML transform did not apply; check the source template');
  }
  if (out.includes(`<script type="module" src="${antdScript}">`)) {
    throw new Error('CN HTML transform left the antd script tag behind');
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
  writeFileSync(`${DIST}/home-cn.html`, toCn(readFileSync(homePath, 'utf8'), files, antd));
  console.log(
    `[cn-html] wrote dist/index-cn.html and dist/home-cn.html (vendor tarball: ${cnVendorTarball()})`,
  );
} else {
  console.log(
    `[cn-html] wrote dist/index-cn.html (vendor tarball: ${cnVendorTarball()}); ` +
      'home.html missing, skipped home-cn.html',
  );
}
