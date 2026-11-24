import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';
import { requireAuth } from '../auth/session';
import * as repo from '../db/folders';
import { isPublicId, type PublicId } from '../../shared/ids';
import type { AppEnv } from '../types';

export const folderRoutes = new Hono<AppEnv>();

const MAX_FOLDER_NAME_LENGTH = 30;

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

folderRoutes.get('/', async (c) => {
  const result = await wrapTime(c, 'db', repo.listFolders(c.env.DB, c.get('user').id));
  return c.json(result);
});

folderRoutes.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = normalizeName(body.name);
  if (!name) return c.json({ error: '文件夹名称需在 1~30 个字符之间' }, 400);

  const folder = await wrapTime(c, 'db', repo.createFolder(c.env.DB, c.get('user').id, name));
  if (!folder) return c.json({ error: '已经有同名文件夹' }, 409);
  return c.json(folder, 201);
});

folderRoutes.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = normalizeName(body.name);
  if (!name) return c.json({ error: '文件夹名称需在 1~30 个字符之间' }, 400);

  const result = await wrapTime(c, 'db', repo.renameFolder(c.env.DB, c.get('user').id, id, name));
  if (result.kind === 'not_found') return c.json({ error: '文件夹不存在' }, 404);
  if (result.kind === 'conflict') return c.json({ error: '已经有同名文件夹' }, 409);
  return c.json(result.folder);
});

folderRoutes.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const deleted = await wrapTime(c, 'db', repo.deleteFolder(c.env.DB, c.get('user').id, id));
  if (!deleted) return c.json({ error: '文件夹不存在' }, 404);
  return c.json({ ok: true, id });
});
