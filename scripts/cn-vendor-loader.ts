/**
 * Inline bootstrap for the mainland HTML variant.
 *
 * npmmirror serves npm tarballs from its CDN but blocks the per-file /files/
 * endpoint for packages that are not on the unpkg allowlist. The tarball itself
 * is fast in mainland China (measured ~100 ms first byte), so this loader:
 *   1. fetches the versioned tarball from cdn.npmmirror.com,
 *   2. verifies its SHA-256,
 *   3. gunzips and extracts React, ReactDOM, React Router and the initial antd
 *      chunk from the tar,
 *   4. creates same-origin blob: module URLs,
 *   5. registers an import map pointing at those blobs,
 *   6. injects the app's entry module scripts.
 *
 * The app entry chunk is prefetched in parallel from deephos.com, so only the
 * vendor bytes wait on npmmirror. The antd chunk is not loaded by a script tag:
 * the entry chunk imports it with a relative specifier, and the import map
 * remaps that resolved URL to the blob. If anything fails (CORS, timeout, hash,
 * unsupported browser), it falls back to the same-origin /vendor/* files and
 * lets the entry chunk fetch antd from /static/js/* normally.
 */
export type CnVendorLoaderOptions = {
  tarballUrl: string;
  sha256: string;
  reactFile: string;
  domFile: string;
  routerFile: string;
  antdFile: string;
  appScripts: string[];
  fallbackBase?: string;
};

export function renderCnVendorLoader(options: CnVendorLoaderOptions): string {
  const config = {
    tarball: options.tarballUrl,
    sha256: options.sha256,
    files: {
      react: options.reactFile,
      dom: options.domFile,
      router: options.routerFile,
      antd: options.antdFile,
    },
    app: options.appScripts,
    fallback: options.fallbackBase ?? '/vendor',
  };

  return `<script>
(function () {
  var CONFIG = ${JSON.stringify(config)};
  var FILES = CONFIG.files;
  var APP = CONFIG.app;
  var FALLBACK = CONFIG.fallback;

  function addImportMap(imports) {
    var el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify({ imports: imports });
    document.head.appendChild(el);
  }

  function loadApp() {
    // Let the parser register the import map before any module is fetched.
    setTimeout(function () {
      for (var i = 0; i < APP.length; i++) {
        var el = document.createElement('script');
        el.type = 'module';
        el.src = APP[i];
        document.head.appendChild(el);
      }
    }, 0);
  }

  function fallback(reason) {
    window.__SWAN_CN_VENDOR__ = 'fallback';
    window.__SWAN_CN_ANTD__ = 'fallback';
    if (reason) console.warn('[swan] CN vendor fallback:', reason);
    addImportMap({
      react: FALLBACK + '/' + FILES.react,
      'react/jsx-runtime': FALLBACK + '/' + FILES.react,
      'react-dom': FALLBACK + '/' + FILES.dom,
      'react-dom/client': FALLBACK + '/' + FILES.dom,
      'react-router': FALLBACK + '/' + FILES.router,
      'react-router/dom': FALLBACK + '/' + FILES.router,
    });
    // No antd mapping: the entry chunk's relative import resolves to
    // /static/js/<antdFile> and is fetched from deephos.com as usual.
    loadApp();
  }

  function readString(bytes, start, length) {
    var end = start;
    while (end < start + length && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(start, end));
  }

  function parseTar(buffer) {
    var bytes = new Uint8Array(buffer);
    var files = {};
    var offset = 0;
    while (offset + 512 <= bytes.length) {
      var header = bytes.subarray(offset, offset + 512);
      var zero = true;
      for (var i = 0; i < 512; i++) {
        if (header[i] !== 0) {
          zero = false;
          break;
        }
      }
      if (zero) break;

      var name = readString(header, 0, 100);
      var size = parseInt(readString(header, 124, 12).trim() || '0', 8);
      var type = header[156] || 48;
      var dataStart = offset + 512;
      if (type === 48 || type === 0) {
        files[name] = bytes.subarray(dataStart, dataStart + size);
      }
      offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  async function gunzip(buffer) {
    var stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }

  function hex(buffer) {
    return Array.prototype.map
      .call(new Uint8Array(buffer), function (byte) {
        return byte.toString(16).padStart(2, '0');
      })
      .join('');
  }

  async function main() {
    try {
      if (
        !window.fetch ||
        !window.DecompressionStream ||
        !window.crypto ||
        !crypto.subtle ||
        !window.URL ||
        !URL.createObjectURL
      ) {
        throw new Error('unsupported browser');
      }

      var controller = window.AbortController ? new AbortController() : null;
      var timer = controller
        ? setTimeout(function () {
            controller.abort();
          }, 4000)
        : null;

      var response = await fetch(CONFIG.tarball, {
        cache: 'force-cache',
        credentials: 'omit',
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!response.ok) throw new Error('tarball HTTP ' + response.status);

      var buffer = await response.arrayBuffer();
      var digest = await crypto.subtle.digest('SHA-256', buffer);
      if (hex(digest) !== CONFIG.sha256) throw new Error('tarball hash mismatch');

      var tar = parseTar(await gunzip(buffer));
      var urls = {};
      for (var key in FILES) {
        if (!Object.prototype.hasOwnProperty.call(FILES, key)) continue;
        var entry = tar['package/' + FILES[key]];
        if (!entry) throw new Error('missing ' + FILES[key]);
        urls[key] = URL.createObjectURL(new Blob([entry], { type: 'text/javascript' }));
      }

      // The entry chunk imports the antd chunk as "./lib-antd.<hash>.mjs".
      // Import maps apply after URL resolution, so map the absolute URL that
      // relative specifier resolves to, not the bare filename.
      var antdUrl = new URL('/static/js/' + FILES.antd, location.href).href;
      var imports = {
        react: urls.react,
        'react/jsx-runtime': urls.react,
        'react-dom': urls.dom,
        'react-dom/client': urls.dom,
        'react-router': urls.router,
        'react-router/dom': urls.router,
      };
      imports[antdUrl] = urls.antd;
      addImportMap(imports);
      window.__SWAN_CN_VENDOR__ = 'tarball';
      window.__SWAN_CN_ANTD__ = 'tarball';
      loadApp();
    } catch (error) {
      fallback(error && error.message ? error.message : String(error));
    }
  }

  main();
})();
</script>`;
}
