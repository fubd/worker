/**
 * Public origin of the CN static assets.
 *
 * The bucket is served through its default domain (no ICP filing needed) and
 * `scripts/upload-oss.ts` mirrors `dist/static` into the same `static/` prefix,
 * so a `/static/js/x.mjs` URL on deephos.com maps 1:1 to `${baseUrl}/static/js/x.mjs`.
 * CORS and Referer rules live on the bucket and are configured out of band.
 */
export const OSS_STATIC = {
  region: 'oss-cn-beijing',
  bucket: 'deephos-static',
  baseUrl: 'https://deephos-static.oss-cn-beijing.aliyuncs.com',
} as const;
