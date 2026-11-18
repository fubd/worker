/**
 * Verify every OSS asset referenced by the CN build before publishing HTML.
 *
 * Requests intentionally omit Referer: browser dynamic imports do so as well.
 * The response body is compared with the local source so a stale or partially
 * uploaded object cannot pass just because the URL returns 200.
 */
import { readFileSync } from 'node:fs';
import { listOssAssets, OSS_CACHE_CONTROL, ossContentTypes, type OssAsset } from './oss-assets';

function sha256(bytes: ArrayBuffer | Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

async function verifyAsset(asset: OssAsset): Promise<void> {
  const response = await fetch(asset.url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`${asset.key}: expected HTTP 200, received ${response.status}`);
  }

  const expectedTypes = ossContentTypes(asset.key);
  const actualType = response.headers.get('content-type') ?? '';
  if (!expectedTypes.includes(actualType.split(';', 1)[0] ?? '')) {
    throw new Error(
      `${asset.key}: expected Content-Type ${expectedTypes.join(' or ')}, received ${actualType}`,
    );
  }

  const actualCacheControl = response.headers.get('cache-control') ?? '';
  if (actualCacheControl !== OSS_CACHE_CONTROL) {
    throw new Error(
      `${asset.key}: expected Cache-Control ${OSS_CACHE_CONTROL}, received ${actualCacheControl}`,
    );
  }

  const localBytes = readFileSync(asset.absPath);
  const remoteBytes = new Uint8Array(await response.arrayBuffer());
  const localHash = sha256(localBytes);
  const remoteHash = sha256(remoteBytes);
  if (localHash !== remoteHash) {
    throw new Error(
      `${asset.key}: content mismatch (local ${localHash}, remote ${remoteHash}, ` +
        `local ${localBytes.byteLength} B, remote ${remoteBytes.byteLength} B)`,
    );
  }
}

const assets = listOssAssets();
if (assets.length === 0) {
  throw new Error('no OSS assets found; run `bun run build` first');
}

for (const asset of assets) {
  await verifyAsset(asset);
}

console.log(`[oss] verified ${assets.length} assets with status, type, cache, and SHA-256`);
