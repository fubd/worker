/**
 * Shared identity of the CN vendor package.
 *
 * Bump the version whenever the generated vendor files change: the CN HTML
 * points at a versioned npmmirror tarball, and the static assets under
 * /vendor/* are cached immutably. A version bump is the cache-busting step.
 *
 * tarballSha256 pins the exact bytes served by npmmirror. Update it whenever
 * the package version changes; the CN loader falls back to /vendor/* on a
 * mismatch instead of executing unexpected code from the CDN.
 */
export const VENDOR_PACKAGE = {
  name: '@meteor957/swan-vendor',
  version: '0.2.0',
  // SHA-256 of the deterministic `npm pack` output. `npm publish` repacks the
  // same files and npm's packer normalizes timestamps, so the published bytes
  // match; verify by downloading the published tarball and hashing it.
  tarballSha256: 'bc19b84deca6e459860c0fd0e7dfe48c27fad3fcf221eb41f74232ea13c976a0',
  // The initial antd chunk emitted by Rsbuild. Its content hash changes when the
  // antd dependency graph or the initial antd imports change; when it does, bump
  // the package version, republish, and update this field. build:cn-html checks
  // that the file exists in dist before emitting a CN variant.
  antdFile: 'lib-antd.e1ded704.mjs',
} as const;

export function assertVendorPackageLocked(): void {
  if (!/^[a-f0-9]{64}$/.test(VENDOR_PACKAGE.tarballSha256)) {
    throw new Error(
      'VENDOR_PACKAGE.tarballSha256 is not locked. Run `bun run vendor-package`, ' +
        'publish the new version, then write the published tarball SHA-256 into ' +
        'scripts/vendor-package-config.ts.',
    );
  }
}

/**
 * npmmirror's CDN tarball URL.
 *
 * The per-file /files/ endpoint is allowlisted (cnpm/unpkg-white-list) and
 * returns 403 for new packages; the tarball CDN is not. The package name is
 * scoped, so the @ is percent-encoded but the slash stays a path separator,
 * matching the redirect from registry.npmmirror.com.
 */
export function cnVendorTarball(): string {
  const scopedName = VENDOR_PACKAGE.name.replace('@', '%40');
  return (
    `https://cdn.npmmirror.com/packages/${scopedName}/${VENDOR_PACKAGE.version}/` +
    `swan-vendor-${VENDOR_PACKAGE.version}.tgz`
  );
}
