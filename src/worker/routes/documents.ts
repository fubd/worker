import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';
import * as repo from '../db/documents';
import * as versions from '../db/document-versions';
import { folderExists } from '../db/folders';
import { requireAuth } from '../auth/session';
import { checkDocumentQuota } from '../quota';
import { apiRateLimit, documentCreateRateLimit } from '../rate-limit';
import { DOCUMENT_TITLE_MAX_LENGTH } from '../../shared/limits';
import { isPublicId, type PublicId } from '../../shared/ids';
import { decodeDocumentListCursor } from '../../shared/pagination';
import type { DocumentListSort } from '../../shared/types';
import type { AppEnv } from '../types';

export const documentRoutes = new Hono<AppEnv>();

const MAX_CONTENT_LENGTH = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_BATCH_DOCUMENTS = 200;
const INVALID_PUBLIC_ID = Symbol('invalid-public-id');

documentRoutes.use('*', requireAuth);
documentRoutes.use('*', apiRateLimit);

function normalizeTitle(value: unknown, fallback = ''): string | null {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title || title.length > DOCUMENT_TITLE_MAX_LENGTH) return null;
  return title;
}

function parsePublicId(value: string): PublicId | null {
  return isPublicId(value) ? value : null;
}

function parseVersion(value: string): number | null {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : null;
}

function parseFolderFilter(
  value: string | undefined,
): PublicId | null | undefined | typeof INVALID_PUBLIC_ID {
  if (value === undefined || value === '') return undefined;
  if (value === 'unfiled') return null;
  return isPublicId(value) ? value : INVALID_PUBLIC_ID;
}

function parseOptionalFolderId(value: unknown): PublicId | null | typeof INVALID_PUBLIC_ID {
  if (value === null || value === undefined) return null;
  return isPublicId(value) ? value : INVALID_PUBLIC_ID;
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
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
  const folderId = parseFolderFilter(c.req.query('folder'));
  if (folderId === INVALID_PUBLIC_ID) return c.json({ error: 'folder 非法' }, 400);
  const query = (c.req.query('q') ?? '').trim();
  if (query.length > MAX_SEARCH_LENGTH) {
    return c.json({ error: `搜索词不能超过 ${MAX_SEARCH_LENGTH} 个字符` }, 400);
  }
  const favoriteOnly = c.req.query('favorite') === '1';
  const recentOnly = c.req.query('recent') === '1';
  const sort: DocumentListSort = c.req.query('sort') === 'edited' ? 'edited' : 'activity';
  const cursorValue = c.req.query('cursor');
  const cursor = cursorValue ? decodeDocumentListCursor(cursorValue) : null;
  if (cursorValue && !cursor) return c.json({ error: 'cursor 非法' }, 400);
  const ownerId = c.get('user').id;
  const result = await wrapTime(
    c,
    'db',
    repo.listDocuments(c.env.DB, ownerId, {
      limit,
      offset,
      folderId,
      query,
      favoriteOnly,
      recentOnly,
      sort,
      cursor,
    }),
  );
  return c.json(result);
});

documentRoutes.get('/trash', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
  const cursorValue = c.req.query('cursor');
  const cursor = cursorValue ? decodeDocumentListCursor(cursorValue) : null;
  if (cursorValue && !cursor) return c.json({ error: 'cursor 非法' }, 400);
  const ownerId = c.get('user').id;
  const result = await wrapTime(
    c,
    'db',
    repo.listDeletedDocuments(c.env.DB, ownerId, { limit, offset, cursor }),
  );
  return c.json(result);
});

documentRoutes.post('/import', documentCreateRateLimit, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
    contentHtml?: unknown;
    contentText?: unknown;
    folderId?: unknown;
  } | null;
  if (!body) return c.json({ error: '请求体必须是合法 JSON' }, 400);

  const title = normalizeTitle(body.title);
  if (!title) {
    return c.json({ error: `title 长度需在 1~${DOCUMENT_TITLE_MAX_LENGTH} 之间` }, 400);
  }

  const content = normalizeContent(body.content);
  if (!content || content.type !== 'doc') {
    return c.json({ error: 'content 必须是有效的 Tiptap 文档' }, 400);
  }

  const contentHtml = normalizeText(body.contentHtml, 'contentHtml');
  const contentText = normalizeText(body.contentText, 'contentText');
  if (contentHtml === null || contentText === null) {
    return c.json({ error: '导入内容为空或超过 1 MB 限制' }, 400);
  }

  const folderId = parseOptionalFolderId(body.folderId);
  if (folderId === INVALID_PUBLIC_ID) return c.json({ error: 'folderId 非法' }, 400);
  if (folderId !== null && !(await folderExists(c.env.DB, c.get('user').id, folderId))) {
    return c.json({ error: '分组不存在' }, 404);
  }

  const quota = await wrapTime(c, 'db', checkDocumentQuota(c.env.DB, c.get('user').id));
  if (!quota.allowed) {
    return c.json(
      {
        error: `每位用户最多保存 ${quota.limit} 篇文档，请先永久删除不再需要的文档`,
        used: quota.used,
        limit: quota.limit,
      },
      409,
    );
  }

  const document = await wrapTime(
    c,
    'db',
    repo.createImportedDocument(c.env.DB, c.get('user').id, {
      title,
      content,
      contentHtml,
      contentText,
      folderId,
    }),
  );
  return c.json(document, 201);
});

documentRoutes.post('/batch', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    ids?: unknown;
    action?: unknown;
    folderId?: unknown;
    favorite?: unknown;
  } | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'ids 必须是非空数组' }, 400);
  }

  const ids = [...new Set(body.ids)];
  if (
    ids.length > MAX_BATCH_DOCUMENTS ||
    ids.some((value) => typeof value !== 'string' || !isPublicId(value))
  ) {
    return c.json({ error: `一次最多操作 ${MAX_BATCH_DOCUMENTS} 篇文档，且 ID 必须合法` }, 400);
  }

  let action:
    | { kind: 'move'; folderId: PublicId | null }
    | { kind: 'favorite'; favorite: boolean }
    | { kind: 'delete' }
    | { kind: 'restore' };

  if (body.action === 'move') {
    if (!Object.hasOwn(body, 'folderId')) {
      return c.json({ error: '请求体必须包含 folderId' }, 400);
    }
    const folderId = parseOptionalFolderId(body.folderId);
    if (folderId === INVALID_PUBLIC_ID) return c.json({ error: 'folderId 非法' }, 400);
    if (folderId !== null && !(await folderExists(c.env.DB, c.get('user').id, folderId))) {
      return c.json({ error: '分组不存在' }, 404);
    }
    action = { kind: 'move', folderId };
  } else if (body.action === 'favorite') {
    if (typeof body.favorite !== 'boolean') {
      return c.json({ error: 'favorite 必须是布尔值' }, 400);
    }
    action = { kind: 'favorite', favorite: body.favorite };
  } else if (body.action === 'delete' || body.action === 'restore') {
    action = { kind: body.action };
  } else {
    return c.json({ error: '不支持的批量操作' }, 400);
  }

  if (action.kind === 'move') {
    const movedIds = await wrapTime(
      c,
      'db',
      repo.moveDocumentsToFolder(c.env.DB, c.get('user').id, ids as PublicId[], action.folderId),
    );
    return c.json({
      requestedCount: ids.length,
      updatedCount: movedIds.length,
      items: [],
    });
  }
  const result = await wrapTime(
    c,
    'db',
    repo.batchUpdateDocuments(c.env.DB, c.get('user').id, ids as PublicId[], action),
  );
  return c.json(result);
});

documentRoutes.get('/:id/versions', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const ownerId = c.get('user').id;
  const document = await wrapTime(c, 'db', repo.getDocument(c.env.DB, ownerId, id));
  if (!document) return c.json({ error: '文档不存在' }, 404);

  const items = await wrapTime(c, 'db', versions.listDocumentVersions(c.env.DB, ownerId, id));
  return c.json({ items });
});

documentRoutes.get('/:id/children', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);
  const ownerId = c.get('user').id;
  const children = await wrapTime(c, 'db', repo.listDocumentChildren(c.env.DB, ownerId, id));
  if (!children) return c.json({ error: '文档不存在' }, 404);
  const items = children.items;
  return c.json({ items });
});

documentRoutes.get('/:id/versions/:version', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);
  const version = parseVersion(c.req.param('version'));
  if (!version) return c.json({ error: 'version 必须是正整数' }, 400);

  const snapshot = await wrapTime(
    c,
    'db',
    versions.getDocumentVersion(c.env.DB, c.get('user').id, id, version),
  );
  if (!snapshot) return c.json({ error: '版本不存在' }, 404);
  return c.json(snapshot);
});

documentRoutes.post('/:id/versions', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const version = await wrapTime(
    c,
    'db',
    repo.createDocumentCheckpoint(c.env.DB, c.get('user').id, id),
  );
  if (version === null) return c.json({ error: '文档不存在' }, 404);
  return c.json({ version }, 201);
});

documentRoutes.post('/:id/versions/:version/restore', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);
  const version = parseVersion(c.req.param('version'));
  if (!version) return c.json({ error: 'version 必须是正整数' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    expectedVersion?: unknown;
  } | null;
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return c.json({ error: 'expectedVersion 必须是正整数' }, 400);
  }

  const result = await wrapTime(
    c,
    'db',
    repo.restoreDocumentVersion(c.env.DB, c.get('user').id, id, version, expectedVersion),
  );
  if (result.kind === 'not_found') return c.json({ error: '文档不存在' }, 404);
  if (result.kind === 'version_not_found') return c.json({ error: '版本不存在' }, 404);
  if (result.kind === 'conflict') {
    return c.json(
      {
        error: '文档已在其他页面更新，请重新加载后再恢复',
        currentVersion: result.currentVersion,
      },
      409,
    );
  }
  return c.json(result.document);
});

documentRoutes.post('/:id/duplicate', documentCreateRateLimit, async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const quota = await wrapTime(c, 'db', checkDocumentQuota(c.env.DB, c.get('user').id));
  if (!quota.allowed) {
    return c.json(
      {
        error: `每位用户最多保存 ${quota.limit} 篇文档，请先永久删除不再需要的文档`,
        used: quota.used,
        limit: quota.limit,
      },
      409,
    );
  }

  const document = await wrapTime(c, 'db', repo.duplicateDocument(c.env.DB, c.get('user').id, id));
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document, 201);
});

documentRoutes.patch('/:id/share', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as { shared?: unknown } | null;
  if (!body || typeof body.shared !== 'boolean') {
    return c.json({ error: 'shared 必须是布尔值' }, 400);
  }

  const document = await wrapTime(
    c,
    'db',
    repo.setDocumentSharing(c.env.DB, c.get('user').id, id, body.shared),
  );
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document);
});

documentRoutes.get('/:id', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const ownerId = c.get('user').id;
  await wrapTime(c, 'db', repo.touchDocumentViewed(c.env.DB, ownerId, id));
  const document = await wrapTime(c, 'db', repo.getDocument(c.env.DB, ownerId, id));
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document);
});

documentRoutes.post('/', documentCreateRateLimit, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    folderId?: unknown;
    parentId?: unknown;
  };
  const title = normalizeTitle(body.title, '无标题文档');
  if (!title) {
    return c.json({ error: `title 长度需在 1~${DOCUMENT_TITLE_MAX_LENGTH} 之间` }, 400);
  }
  const folderId = parseOptionalFolderId(body.folderId);
  if (folderId === INVALID_PUBLIC_ID) return c.json({ error: 'folderId 非法' }, 400);
  if (folderId !== null && !(await folderExists(c.env.DB, c.get('user').id, folderId))) {
    return c.json({ error: '分组不存在' }, 404);
  }
  const parentId = parseOptionalFolderId(body.parentId);
  if (parentId === INVALID_PUBLIC_ID) return c.json({ error: 'parentId 非法' }, 400);
  if (parentId !== null) {
    const parent = await wrapTime(c, 'db', repo.getDocument(c.env.DB, c.get('user').id, parentId));
    if (!parent) return c.json({ error: '父文档不存在' }, 404);
    if (parent.folderId !== folderId) {
      return c.json({ error: '子文档必须和父文档位于同一分组' }, 400);
    }
  }

  const quota = await wrapTime(c, 'db', checkDocumentQuota(c.env.DB, c.get('user').id));
  if (!quota.allowed) {
    return c.json(
      {
        error: `每位用户最多保存 ${quota.limit} 篇文档，请先永久删除不再需要的文档`,
        used: quota.used,
        limit: quota.limit,
      },
      409,
    );
  }

  const document = await wrapTime(
    c,
    'db',
    repo.createDocument(c.env.DB, c.get('user').id, title, folderId, parentId),
  );
  return c.json(document, 201);
});

documentRoutes.patch('/:id', async (c) => {
  const id = parsePublicId(c.req.param('id'));
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
    if (!title) {
      return c.json({ error: `title 长度需在 1~${DOCUMENT_TITLE_MAX_LENGTH} 之间` }, 400);
    }
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
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const ok = await wrapTime(c, 'db', repo.deleteDocument(c.env.DB, c.get('user').id, id));
  if (!ok) return c.json({ error: '文档不存在' }, 404);
  return c.json({ ok: true, id });
});

documentRoutes.delete('/:id/permanent', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const result = await wrapTime(
    c,
    'db',
    repo.permanentlyDeleteDocument(c.env.DB, c.get('user').id, id),
  );
  if (!result) return c.json({ error: '回收站中没有这篇文档' }, 404);

  if (result.objectKeys.length > 0) {
    await c.env.ATTACHMENTS.delete(result.objectKeys).catch((error: unknown) => {
      console.error(`[documents] failed to delete attachments for ${id}`, error);
    });
  }

  return c.json({
    ok: true,
    id,
    deletedAttachmentCount: result.deletedAttachmentCount,
  });
});

documentRoutes.patch('/:id/folder', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    folderId?: unknown;
    parentId?: unknown;
  } | null;
  if (!body || !Object.hasOwn(body, 'folderId')) {
    return c.json({ error: '请求体必须包含 folderId' }, 400);
  }
  const folderId = parseOptionalFolderId(body.folderId);
  if (folderId === INVALID_PUBLIC_ID) return c.json({ error: 'folderId 非法' }, 400);
  if (folderId !== null && !(await folderExists(c.env.DB, c.get('user').id, folderId))) {
    return c.json({ error: '分组不存在' }, 404);
  }
  const parentId = parseOptionalFolderId(body.parentId);
  if (parentId === INVALID_PUBLIC_ID) return c.json({ error: 'parentId 非法' }, 400);
  if (parentId !== null) {
    const parent = await wrapTime(c, 'db', repo.getDocument(c.env.DB, c.get('user').id, parentId));
    if (!parent) return c.json({ error: '父文档不存在' }, 404);
    if (parent.folderId !== folderId) {
      return c.json({ error: '子文档必须和父文档位于同一分组' }, 400);
    }
  }

  const document = await wrapTime(
    c,
    'db',
    repo.moveDocument(c.env.DB, c.get('user').id, id, folderId, parentId),
  );
  if (!document) return c.json({ error: '文档不存在或不能移动到自身或子文档中' }, 409);
  return c.json(document);
});

documentRoutes.patch('/:id/favorite', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as { favorite?: unknown } | null;
  if (!body || typeof body.favorite !== 'boolean') {
    return c.json({ error: 'favorite 必须是布尔值' }, 400);
  }

  const document = await wrapTime(
    c,
    'db',
    repo.setDocumentFavorite(c.env.DB, c.get('user').id, id, body.favorite),
  );
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document);
});

documentRoutes.patch('/:id/pin', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as { pinned?: unknown } | null;
  if (!body || typeof body.pinned !== 'boolean') {
    return c.json({ error: 'pinned 必须是布尔值' }, 400);
  }

  const document = await wrapTime(
    c,
    'db',
    repo.setDocumentPinned(c.env.DB, c.get('user').id, id, body.pinned),
  );
  if (!document) return c.json({ error: '文档不存在' }, 404);
  return c.json(document);
});

documentRoutes.post('/:id/restore', async (c) => {
  const id = parsePublicId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const document = await wrapTime(c, 'db', repo.restoreDocument(c.env.DB, c.get('user').id, id));
  if (!document) return c.json({ error: '回收站中没有这篇文档' }, 404);
  return c.json(document);
});
