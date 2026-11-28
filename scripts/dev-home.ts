/**
 * Rsbuild serves development assets and proxies API requests. In production,
 * Vercel sends `/` to the Worker's `/home` endpoint so the first response has
 * the correct session; provide the same route during local development.
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const bundleRoot = resolve('dist/vercel');
const workerOrigin = process.env.YUYAN_HOME_WORKER_ORIGIN ?? 'http://127.0.0.1:8787';
function upstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('accept-encoding');
  return headers;
}
function responseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return headers;
}
async function proxy(request: Request, path: string): Promise<Response> {
  const response = await fetch(`${workerOrigin}${path}`, {
    method: request.method,
    headers: upstreamHeaders(request),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response),
  });
}
const homeServer = Bun.serve({
  port: 3002,
  hostname: 'localhost',
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/' || path === '/home') {
      return proxy(request, path === '/' ? '/home?fresh' : path);
    }
    if (path.startsWith('/api/')) return proxy(request, `${path}${url.search}`);
    const file =
      path === '/login'
        ? '/login.html'
        : path === '/docs' || path.startsWith('/docs/')
          ? '/docs.html'
          : path.startsWith('/share/')
            ? '/share.html'
            : path;
    const asset = resolve(bundleRoot, `.${file}`);
    if (!asset.startsWith(`${bundleRoot}${sep}`) || !existsSync(asset)) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(Bun.file(asset));
  },
});

console.log(`[home] http://${homeServer.hostname}:${homeServer.port}/`);

process.on('SIGINT', () => {
  homeServer.stop();
});
