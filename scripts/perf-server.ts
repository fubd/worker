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

const ITEMS = [
  {
    id: 1,
    title: '验证 P0 性能预算',
    completed: false,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
  {
    id: 2,
    title: '检查 Worker 计时',
    completed: true,
    createdAt: '2026-11-21T00:01:00.000Z',
    updatedAt: '2026-11-21T00:01:00.000Z',
  },
  {
    id: 3,
    title: '保留首屏静态内容',
    completed: false,
    createdAt: '2026-11-21T00:02:00.000Z',
    updatedAt: '2026-11-21T00:02:00.000Z',
  },
];

const DOCUMENTS = [
  {
    id: 1,
    title: '雨燕编辑器验证',
    excerpt: '这是用于性能审计的文档快照。',
    version: 3,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:03:00.000Z',
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

    if (url.pathname === '/api/todos') {
      return Response.json({ items: ITEMS }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/documents') {
      return Response.json({ items: DOCUMENTS }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/documents/1') {
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
    if (url.pathname === '/api/stats') {
      return Response.json(
        {
          total: ITEMS.length,
          active: ITEMS.filter((item) => !item.completed).length,
          completed: ITEMS.filter((item) => item.completed).length,
          completionRate: 33,
          database: 'Cloudflare D1',
          runtime: 'Cloudflare Workers',
          region: 'ci',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (url.pathname === '/_vercel/speed-insights/script.js') {
      return new Response('', { headers: { 'Content-Type': MIME['.js'] } });
    }

    const pathname =
      url.pathname === '/'
        ? '/home.html'
        : url.pathname === '/docs'
          ? '/docs.html'
          : url.pathname === '/todos'
            ? '/todos.html'
            : url.pathname === '/about'
              ? '/about.html'
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
