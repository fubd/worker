import type { PublicId } from '../shared/ids';
import {
  DOCUMENT_ATTACHMENT_LIMIT,
  USER_ATTACHMENT_BYTES_LIMIT,
  USER_DOCUMENT_LIMIT,
} from '../shared/limits';

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function checkDocumentQuota(db: D1Database, ownerId: number): Promise<QuotaResult> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM documents WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ count: number }>();
  const used = Number(row?.count ?? 0);
  return { allowed: used < USER_DOCUMENT_LIMIT, used, limit: USER_DOCUMENT_LIMIT };
}

export async function checkAttachmentQuota(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
  nextSize: number,
): Promise<QuotaResult> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(size), 0) AS bytes,
         COALESCE(SUM(
           CASE
             WHEN d.public_id = ? THEN 1
             ELSE 0
           END
         ), 0) AS document_count
       FROM document_attachments a
       JOIN documents d
         ON d.id = a.document_id
        AND d.owner_id = a.owner_id
       WHERE a.owner_id = ?`,
    )
    .bind(documentId, ownerId)
    .first<{ count: number; bytes: number; document_count: number }>();

  const documentCount = Number(row?.document_count ?? 0);
  if (documentCount >= DOCUMENT_ATTACHMENT_LIMIT) {
    return { allowed: false, used: documentCount, limit: DOCUMENT_ATTACHMENT_LIMIT };
  }

  const bytes = Number(row?.bytes ?? 0);
  return {
    allowed: bytes + nextSize <= USER_ATTACHMENT_BYTES_LIMIT,
    used: bytes,
    limit: USER_ATTACHMENT_BYTES_LIMIT,
  };
}
