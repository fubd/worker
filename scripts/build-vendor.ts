/**
 * 把 react / react-dom / react-router 打成三份可独立加载的 ESM 模块，
 * 输出到 public/vendor/。
 *
 * 输出放在 public/ 下，rsbuild build 会把它们原样拷进 dist/vendor/，
 * 由 Workers Static Assets 直接托管。这样 /vendor/* 和 /static/* 一样
 * 走 Cloudflare 的边缘缓存，不再每次请求都进 Worker 回源 R2。
 *
 * 为什么不能直接 bun build react：
 * - react / react-dom 的 npm 包只有 CJS 产物，浏览器不能直接 import
 * - CJS 当入口时只会输出 `export default`：CJS 的导出是运行时的对象属性，
 *   ESM 的具名导出必须在源码里静态写定。入口改写成 ESM 并显式列出导出名即可，
 *   所以这里先生成入口文件，名字从运行时命名空间里读，避免手写漏项。
 *
 * 为什么是 3 个文件：importmap 允许多个说明符指向同一个 URL。
 * react 与 react/jsx-runtime 共享同一份内部实现，react-dom 与 react-dom/client 同理，
 * 合成一份既能少发请求，也不会出现两份 React 实例（Invalid hook call）。
 * router 单独一份，因为它只依赖 react，不依赖 react-dom。
 *
 * 同一份产物也用于发布 @meteor957/swan-vendor（见 README）：
 * 大陆 HTML 的 importmap 指向 npmmirror 上的同名文件，海外仍指向 /vendor/*。
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public/vendor');
const TMP = join(ROOT, '.vendor-entry');

const IMPORTABLE = /^[A-Za-z_$][\w$]*$/;

/** default 不能出现在解构里（`export const { default } = x` 是语法错误） */
const RESERVED = new Set(['default', 'arguments', 'eval']);

async function bundle(entry: string, outfile: string, external: string[] = []) {
  const result = await Bun.build({
    entrypoints: [entry],
    format: 'esm',
    target: 'browser',
    minify: true,
    external,
    naming: outfile,
    outdir: OUT,
    // 不注入会打进 development 版本（体积翻倍还带警告）
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`bundle 失败: ${entry}`);
  }
}

function namesOf(namespace: Record<string, unknown>) {
  return Object.keys(namespace).filter((key) => IMPORTABLE.test(key) && !RESERVED.has(key));
}

/**
 * 拆成「主模块导出」和「副模块独有导出」。
 * 同名项（Fragment / version）只保留主模块的——两边本来就是同一个值；
 * 写两次会构建失败，因为同一个模块里不能有两个同名导出。
 */
function splitNames(primary: Record<string, unknown>, secondary: Record<string, unknown>) {
  const primaryNames = namesOf(primary);
  const seen = new Set(primaryNames);
  const secondaryAll = namesOf(secondary);

  return {
    primaryNames,
    secondaryNames: secondaryAll.filter((name) => !seen.has(name)),
    duplicates: secondaryAll.filter((name) => seen.has(name)),
  };
}

function entrySource(
  parts: { ns: string; specifier: string; names: string[] }[],
  defaultNs: string,
) {
  const lines = parts.map((part) => `import * as ${part.ns} from '${part.specifier}';`);

  for (const part of parts) {
    if (part.names.length > 0) {
      lines.push(`export const { ${part.names.join(', ')} } = ${part.ns};`);
    }
  }

  // 必须补 default：antd 等库里有 `import React from 'react'` 的写法，
  // 缺 default 会拿到 undefined（症状：Cannot read properties of undefined）
  lines.push(`export default ${defaultNs}.default ?? ${defaultNs};`);

  return `${lines.join('\n')}\n`;
}

await rm(OUT, { recursive: true, force: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

const reactNs = (await import('react')) as Record<string, unknown>;
const jsxNs = (await import('react/jsx-runtime')) as Record<string, unknown>;
const domNs = (await import('react-dom')) as Record<string, unknown>;
const clientNs = (await import('react-dom/client')) as Record<string, unknown>;
const routerNs = (await import('react-router')) as Record<string, unknown>;
const routerDomNs = (await import('react-router/dom')) as Record<string, unknown>;

const routerPkg = JSON.parse(
  await readFile(join(ROOT, 'node_modules/react-router/package.json'), 'utf8'),
) as { version: string };

// 文件名带版本号：静态资源按 immutable 一年缓存，同名覆盖会让老访客继续用旧缓存，
// 旧文件的导出集与新 importmap 不匹配时直接白屏。换版本即换 URL 才能安全更新。
const version = String(reactNs.version ?? 'unknown');
const reactFile = `react-${version}.mjs`;
const domFile = `react-dom-${version}.mjs`;
const routerFile = `router-${routerPkg.version}.mjs`;

/**
 * 只导出业务实际用到的 router API。
 * 不能用 namesOf(routerNs) 全量导出：那会把整个 router 包（含 data router 的
 * 服务端/框架适配层）拉进首屏，体积远大于 Rsbuild 里被摇树后的 lib-router。
 * 升级 react-router 后若 API 改名，这里会直接报错，避免产物里悄悄少导出。
 */
const ROUTER_EXPORTS = [
  'createBrowserRouter',
  'isRouteErrorResponse',
  'Outlet',
  'useLocation',
  'useNavigate',
  'useRouteError',
] as const;
const ROUTER_DOM_EXPORTS = ['RouterProvider'] as const;

for (const name of ROUTER_EXPORTS) {
  if (!(name in routerNs)) throw new Error(`react-router 缺少导出: ${name}`);
}
for (const name of ROUTER_DOM_EXPORTS) {
  if (!(name in routerDomNs)) throw new Error(`react-router/dom 缺少导出: ${name}`);
}

const react = splitNames(reactNs, jsxNs);
const dom = splitNames(domNs, clientNs);

await writeFile(
  join(TMP, 'react.js'),
  entrySource(
    [
      { ns: 'ReactNS', specifier: 'react', names: react.primaryNames },
      { ns: 'JsxNS', specifier: 'react/jsx-runtime', names: react.secondaryNames },
    ],
    'ReactNS',
  ),
);

await writeFile(
  join(TMP, 'react-dom.js'),
  entrySource(
    [
      { ns: 'DomNS', specifier: 'react-dom', names: dom.primaryNames },
      { ns: 'ClientNS', specifier: 'react-dom/client', names: dom.secondaryNames },
    ],
    'DomNS',
  ),
);

await writeFile(
  join(TMP, 'router.js'),
  [
    // 必须用 `export { ... } from`，不能 `import * as NS` 后再解构：
    // 命名空间解构会让打包器保留整个模块，router 会从 ~100 kB 涨到 220 kB。
    `export { ${ROUTER_EXPORTS.join(', ')} } from 'react-router';`,
    `export { ${ROUTER_DOM_EXPORTS.join(', ')} } from 'react-router/dom';`,
    '',
  ].join('\n'),
);

await bundle(join(TMP, 'react.js'), reactFile);
// react 必须外部化：否则 react-dom / router 里会打进第二份 React 实例
await bundle(join(TMP, 'react-dom.js'), domFile, ['react']);
await bundle(join(TMP, 'router.js'), routerFile, [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]);

await rm(TMP, { recursive: true, force: true });

console.log(
  `vendor 就绪：${reactFile}（${react.primaryNames.length} 导出 + jsx ${react.secondaryNames.length}）` +
    ` / ${domFile}（${dom.primaryNames.length} 导出 + client ${dom.secondaryNames.length}）` +
    ` / ${routerFile}（${ROUTER_EXPORTS.length + ROUTER_DOM_EXPORTS.length} 导出）` +
    `｜同名跳过：${[...react.duplicates, ...dom.duplicates].join(', ') || '无'}`,
);
console.log(`index.html 的 preload 与 importmap 需指向：${reactFile} / ${domFile} / ${routerFile}`);
