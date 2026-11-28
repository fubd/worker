/**
 * Mirror Vercel's public rewrites for local E2E checks. Root requests go to
 * the Worker, public pages stay static, and all other API traffic is proxied.
 */
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve('dist/vercel');
const worker = process.env.YUYAN_HOME_WORKER_ORIGIN ?? 'http://127.0.0.1:8787';

function targetPath(pathname: string): string {
  if (pathname === '/login') return '/login.html';
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return '/docs.html';
  if (pathname.startsWith('/share/')) return '/share.html';
  return pathname;
}

function headers(request: Request): Headers {
  const result = new Headers(request.headers);
  for (const key of ['host', 'connection', 'content-length', 'accept-encoding']) result.delete(key);
  return result;
}

async function proxy(request: Request, origin: string, path: string): Promise<Response> {
  const response = await fetch(`${origin}${path}`, {
    method: request.method,
    headers: headers(request),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

Bun.serve({
  port: 3003,
  hostname: 'localhost',
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/') return proxy(request, worker, '/home?fresh');
    if (url.pathname.startsWith('/api/'))
      return proxy(request, worker, `${url.pathname}${url.search}`);
    if (url.pathname.startsWith('/_home/')) {
      // Production sends this to the Worker's routes; local E2E uses the bundle.
    }
    const file = resolve(root, `.${targetPath(url.pathname)}`);
    if (!file.startsWith(`${root}${sep}`) || !existsSync(file)) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(Bun.file(file));
  },
});
console.log('[preview] http://localhost:3003/');
