/**
 * Assemble the npm package used by the mainland-China HTML variant.
 *
 * `public/vendor/*.mjs` is also served as same-origin static assets for the
 * global build. This script copies the exact same three files into
 * `.vendor-package/`, plus the Rsbuild-emitted initial antd chunk, with a
 * package.json, README and MIT notice. The npmmirror copy is byte-identical to
 * what /vendor/* and /static/js/* serve.
 *
 * Publish manually (npm requires an OTP / 2FA):
 *   cd .vendor-package && npm publish --access public
 */
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VENDOR_PACKAGE } from './vendor-package-config';

const ROOT = process.cwd();
const SRC = join(ROOT, 'public/vendor');
const DIST_JS = join(ROOT, 'dist/static/js');
const OUT = join(ROOT, '.vendor-package');

const files = await readdir(SRC);
const pick = (pattern: RegExp, label: string) => {
  const match = files.find((file) => pattern.test(file));
  if (!match) throw new Error(`missing ${label} in ${SRC}; run bun run vendor first`);
  return match;
};

const reactFile = pick(/^react-\d[^/]*\.mjs$/, 'react');
const domFile = pick(/^react-dom-[^/]*\.mjs$/, 'react-dom');
const routerFile = pick(/^router-[^/]*\.mjs$/, 'router');

const distFiles = await readdir(DIST_JS);
const antdFile = distFiles.find((file) => /^lib-antd\.[^.]+\.mjs$/.test(file));
if (!antdFile) throw new Error(`missing lib-antd chunk in ${DIST_JS}; run rsbuild build first`);
if (antdFile !== VENDOR_PACKAGE.antdFile) {
  throw new Error(
    `antd chunk is ${antdFile}, but VENDOR_PACKAGE.antdFile is ${VENDOR_PACKAGE.antdFile}. ` +
      'Update scripts/vendor-package-config.ts and bump the package version.',
  );
}

const versionOf = (file: string, prefix: string) => file.slice(prefix.length, -'.mjs'.length);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await Promise.all(
  [reactFile, domFile, routerFile].map((file) => cp(join(SRC, file), join(OUT, file))),
);
await cp(join(DIST_JS, antdFile), join(OUT, antdFile));

await writeFile(
  join(OUT, 'package.json'),
  `${JSON.stringify(
    {
      name: VENDOR_PACKAGE.name,
      version: VENDOR_PACKAGE.version,
      description:
        'Prebundled browser ESM for React, ReactDOM, React Router and the initial antd chunk used by swan-worker.',
      type: 'module',
      license: 'MIT',
      files: ['*.mjs', 'README.md', 'LICENSE'],
      exports: {
        './react': `./${reactFile}`,
        './react-dom': `./${domFile}`,
        './router': `./${routerFile}`,
        './antd': `./${antdFile}`,
      },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(OUT, 'README.md'),
  `# ${VENDOR_PACKAGE.name}

Prebundled browser ESM used by [swan-worker](https://deephos.com). The files are
served from npmmirror as a China-mainland CDN fallback; the same files are also
published as static assets under \`/vendor/*\` and \`/static/js/*\` for the rest of
the world.

| File | Upstream | Version |
| --- | --- | --- |
| \`${reactFile}\` | \`react\` + \`react/jsx-runtime\` | ${versionOf(reactFile, 'react-')} |
| \`${domFile}\` | \`react-dom\` + \`react-dom/client\` | ${versionOf(domFile, 'react-dom-')} |
| \`${routerFile}\` | \`react-router\` + \`react-router/dom\` | ${versionOf(routerFile, 'router-')} |
| \`${antdFile}\` | swan-worker initial antd chunk (antd + @ant-design + rc-*) | content hash \`${antdFile.slice('lib-antd.'.length, -'.mjs'.length)}\` |

\`react\`, \`react-dom\` and \`router\` are single ESM modules. \`react-dom\` and
\`router\` keep \`react\` as an external bare specifier, so a page must provide an
import map that resolves \`react\`, \`react/jsx-runtime\`, \`react-dom\`,
\`react-dom/client\`, \`react-router\` and \`react-router/dom\`.

\`${antdFile}\` is the Rsbuild shared chunk for the initial antd dependency graph.
It has no imports of its own; the app's entry chunk installs its Rspack module
registry. A page that serves it from a blob URL must map the app's original
\`/static/js/${antdFile}\` URL to that blob in the import map.

These are minified builds generated from the upstream npm packages; the
corresponding MIT license notices are in [LICENSE](./LICENSE).
`,
);

await writeFile(
  join(OUT, 'LICENSE'),
  `MIT License

Copyright (c) Meta Platforms, Inc. and affiliates (React, ReactDOM)
Copyright (c) Remix Software Inc. (React Router)
Copyright (c) Ant Design Team and contributors (Ant Design and its dependencies)
Copyright (c) 2026 meteor957 (packaging)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
);

console.log(
  `[vendor-package] wrote ${OUT} (${VENDOR_PACKAGE.name}@${VENDOR_PACKAGE.version}, ` +
    `${reactFile} / ${domFile} / ${routerFile} / ${antdFile})`,
);
console.log(`[vendor-package] publish: cd .vendor-package && npm publish --access public`);
