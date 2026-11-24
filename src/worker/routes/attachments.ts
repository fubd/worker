import { Hono } from 'hono';
import { wrapTime } from 'hono/timing';
import { requireAuth } from '../auth/session';
import * as attachments from '../db/attachments';
import { getDocument } from '../db/documents';
import { createPublicId } from '../db/public-ids';
import { isPublicId, type PublicId } from '../../shared/ids';
import type { AppEnv } from '../types';

export const attachmentRoutes = new Hono<AppEnv>();

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

attachmentRoutes.use('*', requireAuth);

function parsePublicId(value: string): PublicId | null {
  return isPublicId(value) ? value : null;
}

function safeFileName(value: string): string {
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
  return name || '附件';
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'attachment';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

attachmentRoutes.get('/:id/attachments', async (c) => {
  const documentId = parsePublicId(c.req.param('id'));
  if (!documentId) return c.json({ error: 'id 非法' }, 400);

  const ownerId = c.get('user').id;
  const document = await wrapTime(c, 'db', getDocument(c.env.DB, ownerId, documentId));
  if (!document) return c.json({ error: '文档不存在' }, 404);

  const items = await wrapTime(c, 'db', attachments.listAttachments(c.env.DB, ownerId, documentId));
  return c.json({ items });
});

attachmentRoutes.post('/:id/attachments', async (c) => {
  const documentId = parsePublicId(c.req.param('id'));
  if (!documentId) return c.json({ error: 'id 非法' }, 400);

  const ownerId = c.get('user').id;
  const document = await wrapTime(c, 'db', getDocument(c.env.DB, ownerId, documentId));
  if (!document) return c.json({ error: '文档不存在' }, 404);

  const form = await c.req.raw.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ error: '请选择要上传的文件' }, 400);
  if (file.size === 0) return c.json({ error: '不能上传空文件' }, 400);
  if (file.size > MAX_ATTACHMENT_SIZE) return c.json({ error: '单个附件不能超过 10 MB' }, 413);

  const attachmentId = createPublicId();
  const objectKey = `documents/${ownerId}/${documentId}/${attachmentId}`;
  const contentType = file.type.trim().slice(0, 127) || 'application/octet-stream';
  await c.env.ATTACHMENTS.put(objectKey, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: {
      ownerId: String(ownerId),
      documentId,
      attachmentId,
    },
  });

  let attachment;
  try {
    attachment = await wrapTime(
      c,
      'db',
      attachments.createAttachment(c.env.DB, ownerId, documentId, {
        publicId: attachmentId,
        objectKey,
        fileName: safeFileName(file.name),
        contentType,
        size: file.size,
      }),
    );
  } catch (error) {
    await c.env.ATTACHMENTS.delete(objectKey).catch(() => undefined);
    throw error;
  }

  if (!attachment) {
    await c.env.ATTACHMENTS.delete(objectKey);
    return c.json({ error: '文档不存在' }, 404);
  }
  return c.json(attachment, 201);
});

attachmentRoutes.get('/:id/attachments/:attachmentId/download', async (c) => {
  const documentId = parsePublicId(c.req.param('id'));
  const attachmentId = parsePublicId(c.req.param('attachmentId'));
  if (!documentId || !attachmentId) return c.json({ error: '附件 ID 非法' }, 400);

  const row = await wrapTime(
    c,
    'db',
    attachments.getAttachment(c.env.DB, c.get('user').id, documentId, attachmentId),
  );
  if (!row) return c.json({ error: '附件不存在' }, 404);

  const object = await c.env.ATTACHMENTS.get(row.object_key);
  if (!object) return c.json({ error: '附件文件不存在' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', row.content_type);
  headers.set('content-length', String(row.size));
  headers.set('content-disposition', contentDisposition(row.file_name));
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  return new Response(object.body, { headers });
});

attachmentRoutes.delete('/:id/attachments/:attachmentId', async (c) => {
  const documentId = parsePublicId(c.req.param('id'));
  const attachmentId = parsePublicId(c.req.param('attachmentId'));
  if (!documentId || !attachmentId) return c.json({ error: '附件 ID 非法' }, 400);

  const row = await wrapTime(
    c,
    'db',
    attachments.deleteAttachment(c.env.DB, c.get('user').id, documentId, attachmentId),
  );
  if (!row) return c.json({ error: '附件不存在' }, 404);

  await c.env.ATTACHMENTS.delete(row.object_key).catch((error: unknown) => {
    console.error(`[attachments] failed to delete R2 object ${row.object_key}`, error);
  });
  return c.json({ ok: true, id: attachmentId });
});
