import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';

import { getSharedDocument } from '../db/documents';
import { isPublicId } from '../../shared/ids';
import type { AppEnv } from '../types';

export const shareRoutes = new Hono<AppEnv>();

shareRoutes.get('/:shareId', async (c) => {
  const shareId = c.req.param('shareId');
  if (!isPublicId(shareId)) return c.json({ error: '分享链接非法' }, 400);

  const document = await wrapTime(c, 'db', getSharedDocument(c.env.DB, shareId));
  if (!document) return c.json({ error: '分享链接不存在或已失效' }, 404);
  return c.json(document);
});
