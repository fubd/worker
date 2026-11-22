import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';
import * as repo from '../db/documents';
import { requireAuth } from '../auth/session';
import type { AppEnv } from '../types';

export const documentRoutes = new Hono<AppEnv>();

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 1_000_000;

documentRoutes.use('*', requireAuth);

function normalizeTitle(value: unknown, fallback = ''): string | null {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeContent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || value.length > MAX_CONTENT_LENGTH) return null;
  return value;
}

documentRoutes.get('/', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
  const ownerId = c.get('user').id;
  const result = await wrapTime(c, 'db', repo.listDocuments(c.env.DB, ownerId, { limit, offset }));
  return c.json(result);
});

documentRoutes.get('/trash', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
  const ownerId = c.get('user').id;
  const result = await wrapTime(
    c,
    'db',
    repo.listDeletedDocuments(c.env.DB, ownerId, { limit, offset }),
  );
  return c.json(result);
});

documentRoutes.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const document = await wrapTime(c, 'db', repo.getDocument(c.env.DB, c.get('user').id, id));
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document);
});

documentRoutes.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
  const title = normalizeTitle(body.title, '无标题文档');
  if (!title) return c.json({ error: 'title 长度需在 1~200 之间' }, 400);

  const document = await wrapTime(c, 'db', repo.createDocument(c.env.DB, c.get('user').id, title));
  return c.json(document, 201);
});

documentRoutes.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
    contentHtml?: unknown;
    contentText?: unknown;
    version?: unknown;
  } | null;
  if (!body) return c.json({ error: '请求体必须是合法 JSON' }, 400);

  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 1) {
    return c.json({ error: 'version 必须是正整数' }, 400);
  }

  const input: repo.UpdateDocumentInput = {};

  if (body.title !== undefined) {
    const title = normalizeTitle(body.title);
    if (!title) return c.json({ error: 'title 长度需在 1~200 之间' }, 400);
    input.title = title;
  }

  if (body.content !== undefined) {
    const content = normalizeContent(body.content);
    if (!content) return c.json({ error: 'content 必须是 JSON 对象' }, 400);
    input.content = content;
  }

  if (body.contentHtml !== undefined) {
    const contentHtml = normalizeText(body.contentHtml, 'contentHtml');
    if (contentHtml === null) return c.json({ error: 'contentHtml 非法或过长' }, 400);
    input.contentHtml = contentHtml;
  }

  if (body.contentText !== undefined) {
    const contentText = normalizeText(body.contentText, 'contentText');
    if (contentText === null) return c.json({ error: 'contentText 非法或过长' }, 400);
    input.contentText = contentText;
  }

  const result = await wrapTime(
    c,
    'db',
    repo.updateDocument(c.env.DB, c.get('user').id, id, version, input),
  );
  if (result.kind === 'not_found') return c.json({ error: '文档不存在' }, 404);
  if (result.kind === 'conflict') {
    return c.json(
      {
        error: '文档已在其他页面更新，请重新加载后再保存',
        currentVersion: result.currentVersion,
      },
      409,
    );
  }
  return c.json(result.document);
});

documentRoutes.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const ok = await wrapTime(c, 'db', repo.deleteDocument(c.env.DB, c.get('user').id, id));
  if (!ok) return c.json({ error: '文档不存在' }, 404);
  return c.json({ ok: true, id });
});

documentRoutes.post('/:id/restore', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const document = await wrapTime(c, 'db', repo.restoreDocument(c.env.DB, c.get('user').id, id));
  if (!document) return c.json({ error: '回收站中没有这篇文档' }, 404);
  return c.json(document);
});
