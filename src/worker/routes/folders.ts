import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';
import { requireAuth } from '../auth/session';
import * as repo from '../db/folders';
import { isPublicId, type PublicId } from '../../shared/ids';
import type { AppEnv } from '../types';

export const folderRoutes = new Hono<AppEnv>();

const MAX_FOLDER_NAME_LENGTH = 30;
const INVALID_PUBLIC_ID = Symbol('invalid-public-id');

folderRoutes.use('*', requireAuth);

function parseId(value: string): PublicId | null {
  return isPublicId(value) ? value : null;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > MAX_FOLDER_NAME_LENGTH) return null;
  return name;
}

function parseOptionalFolderId(value: unknown): PublicId | null | typeof INVALID_PUBLIC_ID {
  if (value === null || value === undefined) return null;
  return isPublicId(value) ? value : INVALID_PUBLIC_ID;
}

folderRoutes.get('/', async (c) => {
  const result = await wrapTime(c, 'db', repo.listFolders(c.env.DB, c.get('user').id));
  return c.json(result);
});

folderRoutes.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    parentId?: unknown;
  };
  const name = normalizeName(body.name);
  if (!name) return c.json({ error: '文件夹名称需在 1~30 个字符之间' }, 400);
  const parentId = parseOptionalFolderId(body.parentId);
  if (parentId === INVALID_PUBLIC_ID) return c.json({ error: 'parentId 非法' }, 400);

  const result = await wrapTime(
    c,
    'db',
    repo.createFolder(c.env.DB, c.get('user').id, name, parentId),
  );
  if (result.kind === 'parent_not_found') return c.json({ error: '父文件夹不存在' }, 404);
  if (result.kind === 'too_deep') {
    return c.json({ error: `文件夹最多支持 ${repo.MAX_FOLDER_DEPTH} 层` }, 400);
  }
  if (result.kind === 'conflict') return c.json({ error: '同一目录下已有同名文件夹' }, 409);
  return c.json(result.folder, 201);
});

folderRoutes.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = normalizeName(body.name);
  if (!name) return c.json({ error: '文件夹名称需在 1~30 个字符之间' }, 400);

  const result = await wrapTime(c, 'db', repo.renameFolder(c.env.DB, c.get('user').id, id, name));
  if (result.kind === 'not_found') return c.json({ error: '文件夹不存在' }, 404);
  if (result.kind === 'conflict') return c.json({ error: '同一目录下已有同名文件夹' }, 409);
  return c.json(result.folder);
});

folderRoutes.patch('/:id/move', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as { parentId?: unknown } | null;
  if (!body || !Object.hasOwn(body, 'parentId')) {
    return c.json({ error: '请求体必须包含 parentId' }, 400);
  }
  const parentId = parseOptionalFolderId(body.parentId);
  if (parentId === INVALID_PUBLIC_ID) return c.json({ error: 'parentId 非法' }, 400);

  const result = await wrapTime(c, 'db', repo.moveFolder(c.env.DB, c.get('user').id, id, parentId));
  if (result.kind === 'not_found') return c.json({ error: '文件夹不存在' }, 404);
  if (result.kind === 'parent_not_found') return c.json({ error: '目标文件夹不存在' }, 404);
  if (result.kind === 'cycle') return c.json({ error: '不能移动到自身或子文件夹中' }, 409);
  if (result.kind === 'too_deep') {
    return c.json({ error: `文件夹最多支持 ${repo.MAX_FOLDER_DEPTH} 层` }, 400);
  }
  if (result.kind === 'conflict') return c.json({ error: '目标目录下已有同名文件夹' }, 409);
  return c.json(result.folder);
});

folderRoutes.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const result = await wrapTime(c, 'db', repo.deleteFolder(c.env.DB, c.get('user').id, id));
  if (!result.deleted) return c.json({ error: '文件夹不存在' }, 404);
  return c.json({ ok: true, id, ...result });
});
