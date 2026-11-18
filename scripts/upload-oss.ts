/**
 * Mirror dist/static and dist/vendor into the OSS bucket used by the CN HTML variant.
 *
 * CI runs this before deploying Vercel/Worker: the CN HTML references hashed files
 * under OSS_STATIC.baseUrl, so they must exist before the new HTML goes live.
 * Files are stored gzip-compressed behind a long immutable cache; browsers
 * decompress transparently via Content-Encoding.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import OSS from 'ali-oss';
import { listOssAssets, OSS_CACHE_CONTROL, ossContentType } from './oss-assets';
import { OSS_STATIC } from './oss-config';

const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
if (!accessKeyId || !accessKeySecret) {
  throw new Error(
    'OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET are required; set them as GitHub Actions secrets or export them locally.',
  );
}

const client = new OSS({
  region: OSS_STATIC.region,
  bucket: OSS_STATIC.bucket,
  accessKeyId,
  accessKeySecret,
});

const files = listOssAssets();

let uploaded = 0;
let rawBytes = 0;
let gzBytes = 0;

for (const file of files) {
  const raw = readFileSync(file.absPath);
  const body = gzipSync(raw, { level: 9 });
  await client.put(file.key, body, {
    headers: {
      'Content-Type': ossContentType(file.key),
      'Content-Encoding': 'gzip',
      'Cache-Control': OSS_CACHE_CONTROL,
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
