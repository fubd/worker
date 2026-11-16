/**
 * Mirror dist/static into the OSS bucket used by the CN HTML variant.
 *
 * CI runs this before `wrangler deploy`: the CN HTML references hashed files
 * under OSS_STATIC.baseUrl, so they must exist before the new HTML goes live.
 * Files are stored gzip-compressed behind a long immutable cache; browsers
 * decompress transparently via Content-Encoding.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import OSS from 'ali-oss';
import { OSS_STATIC } from './oss-config';

const DIST_STATIC = 'dist/static';

const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
if (!accessKeyId || !accessKeySecret) {
  throw new Error(
    'OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET are required; set them as GitHub Actions secrets or export them locally.',
  );
}
if (!existsSync(DIST_STATIC)) {
  throw new Error(`missing ${DIST_STATIC}; run \`bun run build\` first`);
}

const contentType = (rel: string) => {
  if (rel.endsWith('.css')) return 'text/css';
  if (rel.endsWith('.mjs') || rel.endsWith('.js')) return 'text/javascript';
  return 'application/octet-stream';
};

const client = new OSS({
  region: OSS_STATIC.region,
  bucket: OSS_STATIC.bucket,
  accessKeyId,
  accessKeySecret,
});

const files: { abs: string; rel: string }[] = [];
(function walk(dir: string, rel: string) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const childRel = path.posix.join(rel, name);
    if (statSync(abs).isDirectory()) walk(abs, childRel);
    else files.push({ abs, rel: childRel });
  }
})(DIST_STATIC, '');

let uploaded = 0;
let rawBytes = 0;
let gzBytes = 0;

for (const file of files) {
  const raw = readFileSync(file.abs);
  const body = gzipSync(raw, { level: 9 });
  await client.put(`static/${file.rel}`, body, {
    headers: {
      'Content-Type': contentType(file.rel),
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  uploaded += 1;
  rawBytes += raw.length;
  gzBytes += body.length;
}

console.log(
  `[oss] uploaded ${uploaded} files to ${OSS_STATIC.baseUrl}/static ` +
    `(${rawBytes} B raw / ${gzBytes} B gzip)`,
);
