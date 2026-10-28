/**
 * 把 react / react-dom 打成可独立加载的 ESM 模块，输出到 public/vendor/。
 *
 * 为什么要这一步：
 * - react 和 react-dom 的 npm 包只有 CJS 产物，浏览器不能直接 import
 * - 直接 bun build 只会得到 `export default`，丢掉所有具名导出（useState 等）
 * - 所以先 bundle 成 impl 文件，再按运行时真实导出名生成 wrapper
 *
 * react 与 react/jsx-runtime 必须来自同一个 bundle，否则会出现两份 React 实例
 * （典型症状：Invalid hook call）。
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
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

function reExport(
  implFile: string,
  implExport: string,
  localName: string,
  namespace: Record<string, unknown>,
) {
  const names = namesOf(namespace);
  const body = [
    `import { ${implExport} as ${localName} } from './${implFile}';`,
    `export const { ${names.join(', ')} } = ${localName};`,
    // 必须补 default：antd 等库里有 `import React from 'react'` 的写法，
    // 缺 default 会拿到 undefined（症状：Cannot read properties of undefined）
    `export default ${localName}.default ?? ${localName};`,
    '',
  ].join('\n');

  return { body, count: names.length };
}

await rm(OUT, { recursive: true, force: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

// 入口：react 与 jsx-runtime 放一起，共享同一份内部实现
await writeFile(
  join(TMP, 'react.js'),
  `import * as react from 'react';\nimport * as jsx from 'react/jsx-runtime';\nexport { react, jsx };\n`,
);

// 入口：react-dom 与 client 放一起，避免 DOM 运行时被复制两份
await writeFile(
  join(TMP, 'react-dom.js'),
  `import * as dom from 'react-dom';\nimport * as client from 'react-dom/client';\nexport { dom, client };\n`,
);

await bundle(join(TMP, 'react.js'), 'react.impl.mjs');
await bundle(join(TMP, 'react-dom.js'), 'react-dom.impl.mjs', ['react']);

const reactNs = await import('react');
const jsxNs = await import('react/jsx-runtime');
const domNs = await import('react-dom');
const clientNs = await import('react-dom/client');

const wrappers: Record<string, string> = {};

const reactWrapper = reExport(
  'react.impl.mjs',
  'react',
  'ReactImpl',
  reactNs as Record<string, unknown>,
);
wrappers['react.mjs'] = reactWrapper.body;

const jsxWrapper = reExport('react.impl.mjs', 'jsx', 'JsxImpl', jsxNs as Record<string, unknown>);
wrappers['react-jsx-runtime.mjs'] = jsxWrapper.body;

const domWrapper = reExport(
  'react-dom.impl.mjs',
  'dom',
  'DomImpl',
  domNs as Record<string, unknown>,
);
wrappers['react-dom.mjs'] = domWrapper.body;

const clientWrapper = reExport(
  'react-dom.impl.mjs',
  'client',
  'ClientImpl',
  clientNs as Record<string, unknown>,
);
wrappers['react-dom-client.mjs'] = clientWrapper.body;

for (const [file, body] of Object.entries(wrappers)) {
  await writeFile(join(OUT, file), body);
}

await rm(TMP, { recursive: true, force: true });

console.log(
  `vendor 就绪：react ${reactWrapper.count} 个导出 / jsx-runtime ${jsxWrapper.count} / react-dom ${domWrapper.count} / react-dom-client ${clientWrapper.count}`,
);
