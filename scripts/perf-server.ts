/**
 * Stable local fixture server for the Lighthouse CI budget.
 *
 * Vercel rewrites public routes to static HTML files, so LHCI's plain static
 * server needs the same mappings. It also returns deterministic API data;
 * Lighthouse still owns the audit and assertions.
 */
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve('dist/vercel');
const PORT = Number(process.env.PERF_PORT ?? 4173);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const DOCUMENTS = [
  {
    id: 'PerformanceFixture000001',
    title: '雨燕编辑器验证',
    excerpt: '这是用于性能审计的文档快照。',
    folderId: null,
    version: 3,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:03:00.000Z',
    deletedAt: null,
  },
];

function safeFile(pathname: string): string | null {
  const file = resolve(ROOT, `.${pathname}`);
  return file === ROOT || file.startsWith(`${ROOT}${sep}`) ? file : null;
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/auth/me') {
      if (request.headers.get('referer')?.includes('/login')) {
        return Response.json({ error: '请先登录' }, { status: 401 });
      }
      return Response.json(
        {
          user: {
            id: 1,
            email: 'owner@example.com',
            name: '雨燕用户',
            avatarUrl: '',
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (url.pathname === '/api/documents') {
      return Response.json({ items: DOCUMENTS }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/documents/trash') {
      return Response.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/documents/PerformanceFixture000001') {
      return Response.json(
        {
          ...DOCUMENTS[0],
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '这是用于性能审计的文档快照。' }],
              },
            ],
          },
          contentHtml: '<p>这是用于性能审计的文档快照。</p>',
          contentText: '这是用于性能审计的文档快照。',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (url.pathname === '/_vercel/speed-insights/script.js') {
      return new Response('', { headers: { 'Content-Type': MIME['.js'] } });
    }

    const pathname =
      url.pathname === '/'
        ? '/index.html'
        : url.pathname === '/login'
          ? '/login.html'
          : url.pathname === '/docs' || url.pathname.startsWith('/docs/')
            ? '/docs.html'
            : url.pathname;
    const file = safeFile(pathname);
    if (!file || !existsSync(file)) return new Response('not found', { status: 404 });

    return new Response(Bun.file(file), {
      headers: {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  },
});

console.log(`perf server ready at http://127.0.0.1:${server.port}`);

function shutdown() {
  server.stop(true);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
