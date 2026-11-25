import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { Glob } from 'bun';

const WARNING_LIMIT = 213_000;
const cases = JSON.parse(readFileSync('.size-limit.json', 'utf8')) as Array<{
  name: string;
  path: string | string[];
}>;
const docsCase = cases.find((item) => item.name === 'docs route');
if (!docsCase) throw new Error('docs route budget is missing');

const patterns = Array.isArray(docsCase.path) ? docsCase.path : [docsCase.path];
const included = patterns
  .filter((pattern) => !pattern.startsWith('!'))
  .map((path) => new Glob(path));
const ignored = patterns
  .filter((pattern) => pattern.startsWith('!'))
  .map((path) => new Glob(path.slice(1)));
const files = [...new Set(included.flatMap((pattern) => [...pattern.scanSync('.')]))].filter(
  (file) => !ignored.some((pattern) => pattern.match(file)) && !file.endsWith('.map'),
);
const size = files.reduce(
  (total, file) =>
    total +
    brotliCompressSync(readFileSync(file), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  0,
);

if (size >= WARNING_LIMIT) {
  console.warn(
    `[budget] docs route is ${(size / 1000).toFixed(2)} kB; warning threshold is 213 kB (build limit: 218 kB).`,
  );
} else {
  console.log('[budget] docs route is below the 213 kB warning threshold.');
}
