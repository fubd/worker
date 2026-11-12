/**
 * Build-time static server for the first-screen capture.
 *
 * Serves the freshly built dist/ the same way the Worker would for the paths
 * the home page needs:
 * - /api/stats returns deterministic mock data (the snapshot must not depend
 *   on production data or network timing)
 * - /vendor/* comes from the local vendor/ directory (the real Worker proxies
 *   these from R2)
 * - / serves dist/index.html during capture, and dist/home.html during the
 *   post-generation verification (setServeHome)
 *
 * Everything is no-store so each capture starts from a clean cache.
 */
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { FIRST_SCREEN_STATS } from '../../src/shared/first-screen';

const NO_STORE = { 'Cache-Control': 'no-store' };

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(pathname: string): string {
  const dot = pathname.lastIndexOf('.');
  return (dot >= 0 && MIME[pathname.slice(dot).toLowerCase()]) || 'application/octet-stream';
}

/** Resolve a URL path inside root and reject traversal outside it. */
function resolveInside(root: string, pathname: string): string | null {
  const full = resolve(root, pathname.startsWith('/') ? `.${pathname}` : pathname);
  const base = resolve(root);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

export type CaptureServer = {
  url: string;
  setServeHome(value: boolean): void;
  setStatsDelay(ms: number): void;
  stop(): void;
};

export function startCaptureServer(distDir: string, vendorDir: string): CaptureServer {
  const distRoot = resolve(distDir);
  const vendorRoot = resolve(vendorDir);
  let serveHome = false;
  let statsDelayMs = 0;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      if (pathname === '/api/stats') {
        if (statsDelayMs > 0) await Bun.sleep(statsDelayMs);
        return Response.json(FIRST_SCREEN_STATS, { headers: NO_STORE });
      }
      if (pathname === '/api/health') {
        return Response.json(
          { ok: true, runtime: 'capture', environment: 'capture' },
          { headers: NO_STORE },
        );
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return Response.json(
          { error: 'Not Found', path: pathname },
          { status: 404, headers: NO_STORE },
        );
      }

      if (pathname.startsWith('/vendor/')) {
        const file = resolveInside(vendorRoot, pathname.slice('/vendor/'.length));
        if (file && existsSync(file)) {
          return new Response(Bun.file(file), {
            headers: { 'Content-Type': 'text/javascript; charset=utf-8', ...NO_STORE },
          });
        }
        return new Response('Not Found', { status: 404, headers: NO_STORE });
      }

      if (pathname === '/') {
        if (serveHome) {
          const home = resolveInside(distRoot, '/home.html');
          if (home && existsSync(home)) {
            return new Response(Bun.file(home), {
              headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
            });
          }
        }
        pathname = '/index.html';
      }

      const file = resolveInside(distRoot, pathname);
      if (file && existsSync(file)) {
        return new Response(Bun.file(file), {
          headers: { 'Content-Type': contentType(pathname), ...NO_STORE },
        });
      }

      // SPA fallback, matching not_found_handling: single-page-application.
      const index = resolveInside(distRoot, '/index.html');
      if (index && existsSync(index)) {
        return new Response(Bun.file(index), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
        });
      }

      return new Response('Not Found', { status: 404, headers: NO_STORE });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    setServeHome(value: boolean) {
      serveHome = value;
    },
    setStatsDelay(ms: number) {
      statsDelayMs = ms;
    },
    stop() {
      server.stop(true);
    },
  };
}
