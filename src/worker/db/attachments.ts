import type { PublicId } from '../../shared/ids';
import type { AttachmentRow, DocumentAttachment } from '../types';

function toIso(value: string): string {
  return /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
}

function toAttachment(row: AttachmentRow): DocumentAttachment {
  return {
    id: row.public_id,
    fileName: row.file_name,
    contentType: row.content_type,
    size: row.size,
    createdAt: toIso(row.created_at),
  };
}

const ATTACHMENT_COLUMNS = `
  a.id, a.public_id, a.owner_id, a.document_id, a.object_key,
  a.file_name, a.content_type, a.size, a.created_at
`;

const RETURNING_ATTACHMENT_COLUMNS = `
  id, public_id, owner_id, document_id, object_key,
  file_name, content_type, size, created_at
`;

export async function listAttachments(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
): Promise<DocumentAttachment[]> {
  const result = await db
    .prepare(
      `SELECT ${ATTACHMENT_COLUMNS}
       FROM document_attachments a
       JOIN documents d ON d.id = a.document_id
       WHERE a.owner_id = ? AND d.owner_id = ? AND d.public_id = ?
         AND d.deleted_at IS NULL
       ORDER BY a.created_at DESC, a.id DESC`,
    )
    .bind(ownerId, ownerId, documentId)
    .all<AttachmentRow>();
  return result.results.map(toAttachment);
}

export async function createAttachment(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
  input: {
    publicId: PublicId;
    objectKey: string;
    fileName: string;
    contentType: string;
    size: number;
  },
): Promise<DocumentAttachment | null> {
  const created = await db
    .prepare(
      `INSERT INTO document_attachments (
         public_id, owner_id, document_id, object_key, file_name, content_type, size
       )
       SELECT ?, ?, d.id, ?, ?, ?, ?
       FROM documents d
       WHERE d.public_id = ? AND d.owner_id = ? AND d.deleted_at IS NULL
       RETURNING ${RETURNING_ATTACHMENT_COLUMNS}`,
    )
    .bind(
      input.publicId,
      ownerId,
      input.objectKey,
      input.fileName,
      input.contentType,
      input.size,
      documentId,
      ownerId,
    )
    .first<AttachmentRow>();
  return created ? toAttachment(created) : null;
}

export async function getAttachment(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
  attachmentId: PublicId,
): Promise<AttachmentRow | null> {
  return db
    .prepare(
      `SELECT ${ATTACHMENT_COLUMNS}
       FROM document_attachments a
       JOIN documents d ON d.id = a.document_id
       WHERE a.public_id = ? AND a.owner_id = ? AND d.owner_id = ?
         AND d.public_id = ? AND d.deleted_at IS NULL`,
    )
    .bind(attachmentId, ownerId, ownerId, documentId)
    .first<AttachmentRow>();
}

export async function deleteAttachment(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
  attachmentId: PublicId,
): Promise<AttachmentRow | null> {
  return db
    .prepare(
      `DELETE FROM document_attachments
       WHERE public_id = ? AND owner_id = ?
         AND document_id = (
           SELECT id FROM documents
           WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
         )
       RETURNING ${RETURNING_ATTACHMENT_COLUMNS}`,
    )
    .bind(attachmentId, ownerId, documentId, ownerId)
    .first<AttachmentRow>();
}
