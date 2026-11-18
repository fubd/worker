import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { OSS_STATIC } from './oss-config';

export const OSS_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const SOURCES = [
  { dir: 'dist/static', keyPrefix: 'static' },
  // CN import map 指向 /static/vendor/*，与 entry 的 /static/js/* 同前缀
  { dir: 'dist/vendor', keyPrefix: 'static/vendor' },
] as const;

export interface OssAsset {
  absPath: string;
  key: string;
  url: string;
}

export function ossContentType(key: string): string {
  if (key.endsWith('.css')) return 'text/css';
  if (key.endsWith('.mjs') || key.endsWith('.js')) return 'application/javascript';
  return 'application/octet-stream';
}

export function ossContentTypes(key: string): readonly string[] {
  const canonical = ossContentType(key);
  if (canonical === 'application/javascript') {
    return [canonical, 'text/javascript'];
  }
  return [canonical];
}

export function listOssAssets(): OssAsset[] {
  const assets: OssAsset[] = [];

  for (const source of SOURCES) {
    if (!existsSync(source.dir)) {
      throw new Error(`missing ${source.dir}; run \`bun run build\` first`);
    }

    (function walk(dir: string, rel: string) {
      for (const name of readdirSync(dir)) {
        const absPath = path.join(dir, name);
        const childRel = path.posix.join(rel, name);
        if (statSync(absPath).isDirectory()) {
          walk(absPath, childRel);
          continue;
        }

        const key = `${source.keyPrefix}/${childRel}`;
        assets.push({
          absPath,
          key,
          url: `${OSS_STATIC.baseUrl}/${key}`,
        });
      }
    })(source.dir, '');
  }

  return assets.sort((left, right) => left.key.localeCompare(right.key));
}
