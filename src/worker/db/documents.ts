import type {
  DocumentImportInput,
  DocumentRecord,
  DocumentRow,
  DocumentSummary,
  SharedDocument,
} from '../types';
import type { PublicId } from '../../shared/ids';
import { encodeDocumentListCursor, type DocumentListCursor } from '../../shared/pagination';
import { createPublicId } from './public-ids';
import { captureVersion, captureVersionIfDue, getDocumentVersion } from './document-versions';

const LIST_COLUMNS = `
  d.id, d.public_id, d.owner_id, d.title, substr(d.content_text, 1, 140) AS content_text,
  d.folder_id, f.public_id AS folder_public_id,
  d.parent_document_id, parent.public_id AS parent_document_public_id,
  (SELECT COUNT(id) FROM documents child
   WHERE child.owner_id = d.owner_id
     AND child.parent_document_id = d.id
     AND child.deleted_at IS NULL) AS child_count,
  d.is_favorite, d.is_pinned, d.last_viewed_at, d.share_id, d.shared_at,
  d.version, d.created_at, d.updated_at, d.deleted_at
`;

const FULL_COLUMNS = `
  d.id, d.public_id, d.owner_id, d.title, d.content_json, d.content_html, d.content_text,
  d.folder_id, f.public_id AS folder_public_id,
  d.parent_document_id, parent.public_id AS parent_document_public_id,
  (SELECT COUNT(id) FROM documents child
   WHERE child.owner_id = d.owner_id
     AND child.parent_document_id = d.id
     AND child.deleted_at IS NULL) AS child_count,
  d.is_favorite, d.is_pinned, d.last_viewed_at, d.share_id, d.shared_at,
  d.version, d.created_at, d.updated_at, d.deleted_at
`;

const EMPTY_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

interface VersionSourceRow {
  id: number;
  owner_id: number;
  version: number;
  title: string;
  content_json: string;
  content_html: string;
  content_text: string;
  created_at: string;
  updated_at: string;
}

function toIso(value: string): string {
  if (value.includes('T')) return value;
  return `${value.replace(' ', 'T')}Z`;
}

function parseContent(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.public_id,
    title: row.title,
    excerpt: row.content_text.trim(),
    folderId: row.folder_public_id,
    parentId: row.parent_document_public_id,
    childCount: Number(row.child_count ?? 0),
    favorite: row.is_favorite === 1,
    pinned: row.is_pinned === 1,
    lastViewedAt: row.last_viewed_at ? toIso(row.last_viewed_at) : null,
    shareId: row.share_id,
    sharedAt: row.shared_at ? toIso(row.shared_at) : null,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
  };
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    ...toSummary(row),
    content: parseContent(row.content_json),
    contentHtml: row.content_html,
    contentText: row.content_text,
  };
}

const DOCUMENT_JOINS = `
  LEFT JOIN folders f
    ON f.id = d.folder_id
   AND f.owner_id = d.owner_id
  LEFT JOIN documents parent
    ON parent.id = d.parent_document_id
   AND parent.owner_id = d.owner_id
   AND parent.deleted_at IS NULL
`;

async function getVersionSource(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<VersionSourceRow | null> {
  return db
    .prepare(
      `SELECT
         id, owner_id, version, title,
         content_json, content_html, content_text, created_at, updated_at
       FROM documents
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<VersionSourceRow>();
}

export async function listDocuments(
  db: D1Database,
  ownerId: number,
  options: {
    limit?: number;
    offset?: number;
    folderId?: PublicId | null;
    query?: string;
    favoriteOnly?: boolean;
    recentOnly?: boolean;
    cursor?: DocumentListCursor | null;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions = ['d.owner_id = ?', 'd.deleted_at IS NULL'];
  const params: unknown[] = [ownerId];

  if (options.folderId === null) {
    conditions.push('d.folder_id IS NULL');
  } else if (options.folderId) {
    conditions.push(
      `d.folder_id = (
         SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
       )`,
    );
    params.push(ownerId, options.folderId);
  }

  conditions.push('d.parent_document_id IS NULL');

  if (options.favoriteOnly) {
    conditions.push('d.is_favorite = 1');
  }
  if (options.recentOnly) {
    conditions.push('d.last_viewed_at IS NOT NULL');
  }

  if (options.cursor) {
    conditions.push(
      `(
         d.is_pinned,
         d.is_favorite,
         COALESCE(d.last_viewed_at, d.updated_at),
         d.id
       ) < (?, ?, ?, ?)`,
    );
    params.push(
      options.cursor.pinned ? 1 : 0,
      options.cursor.favorite ? 1 : 0,
      options.cursor.activityAt,
      options.cursor.id,
    );
  }

  const query = options.query?.trim();
  if (query) {
    conditions.push(
      '(instr(lower(d.title), lower(?)) > 0 OR instr(lower(d.content_text), lower(?)) > 0)',
    );
    params.push(query, query);
  }

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents d
       ${DOCUMENT_JOINS}
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         d.is_pinned DESC,
         d.is_favorite DESC,
         COALESCE(d.last_viewed_at, d.updated_at) DESC,
         d.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit + 1, offset)
    .all<DocumentRow>();

  const rows = result.results ?? [];
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(toSummary),
    nextCursor:
      rows.length > limit && last
        ? encodeDocumentListCursor({
            pinned: last.is_pinned === 1,
            favorite: last.is_favorite === 1,
            activityAt: last.last_viewed_at ?? last.updated_at,
            id: last.id,
          })
        : null,
  };
}

export async function listDeletedDocuments(
  db: D1Database,
  ownerId: number,
  options: { limit?: number; offset?: number; cursor?: DocumentListCursor | null } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = ['d.owner_id = ?', 'd.deleted_at IS NOT NULL'];
  const params: unknown[] = [ownerId];
  if (options.cursor) {
    conditions.push('(d.deleted_at, d.id) < (?, ?)');
    params.push(options.cursor.activityAt, options.cursor.id);
  }

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents d
       ${DOCUMENT_JOINS}
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.deleted_at DESC, d.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit + 1, offset)
    .all<DocumentRow>();

  const rows = result.results ?? [];
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(toSummary),
    nextCursor:
      rows.length > limit && last?.deleted_at
        ? encodeDocumentListCursor({
            pinned: false,
            favorite: false,
            activityAt: last.deleted_at,
            id: last.id,
          })
        : null,
  };
}

export async function getDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${FULL_COLUMNS}
       FROM documents d
       ${DOCUMENT_JOINS}
       WHERE d.public_id = ? AND d.owner_id = ? AND d.deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function touchDocumentViewed(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<void> {
  await db
    .prepare(
      `UPDATE documents
       SET last_viewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .run();
}

export async function listDocumentChildren(
  db: D1Database,
  ownerId: number,
  parentId: PublicId,
): Promise<{ items: DocumentSummary[] } | null> {
  const parent = await db
    .prepare(
      `SELECT id FROM documents
       WHERE owner_id = ? AND public_id = ? AND deleted_at IS NULL`,
    )
    .bind(ownerId, parentId)
    .first<{ id: number }>();
  if (!parent) return null;

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents d
       ${DOCUMENT_JOINS}
       WHERE d.owner_id = ? AND d.deleted_at IS NULL
         AND d.parent_document_id = ?
       ORDER BY d.is_pinned DESC, d.is_favorite DESC, d.updated_at DESC, d.id DESC`,
    )
    .bind(ownerId, parent.id)
    .all<DocumentRow>();
  return { items: (result.results ?? []).map(toSummary) };
}

export async function createDocument(
  db: D1Database,
  ownerId: number,
  title: string,
  folderId: PublicId | null = null,
  parentId: PublicId | null = null,
): Promise<DocumentRecord> {
  const publicId = createPublicId();
  await db
    .prepare(
      `INSERT INTO documents (
         public_id, owner_id, folder_id, parent_document_id,
         title, content_json, content_html, content_text
       )
       VALUES (
         ?, ?, (
           SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
         ), (
           SELECT id FROM documents
           WHERE owner_id = ? AND public_id = ? AND deleted_at IS NULL
         ), ?, ?, '<p></p>', ''
       )`,
    )
    .bind(publicId, ownerId, ownerId, folderId, ownerId, parentId, title, EMPTY_CONTENT_JSON)
    .run();

  const document = await getDocument(db, ownerId, publicId);
  if (!document) {
    throw new Error('Failed to create document');
  }

  return document;
}

export async function createImportedDocument(
  db: D1Database,
  ownerId: number,
  input: DocumentImportInput,
): Promise<DocumentRecord> {
  const publicId = createPublicId();
  await db
    .prepare(
      `INSERT INTO documents (
         public_id, owner_id, folder_id, title, content_json, content_html, content_text
       )
       VALUES (
         ?, ?, (
           SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
         ), ?, ?, ?, ?
       )`,
    )
    .bind(
      publicId,
      ownerId,
      ownerId,
      input.folderId,
      input.title,
      JSON.stringify(input.content),
      input.contentHtml,
      input.contentText,
    )
    .run();

  const document = await getDocument(db, ownerId, publicId);
  if (!document) {
    throw new Error('Failed to create imported document');
  }
  return document;
}

export async function duplicateDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<DocumentRecord | null> {
  const source = await getDocument(db, ownerId, id);
  if (!source) return null;

  const suffix = ' 副本';
  const title = `${source.title.slice(0, 30 - suffix.length).trimEnd()}${suffix}`;
  const publicId = createPublicId();
  await db
    .prepare(
      `INSERT INTO documents (
         public_id, owner_id, folder_id, title,
         content_json, content_html, content_text
       )
       SELECT ?, owner_id, folder_id, ?, content_json, content_html, content_text
       FROM documents
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(publicId, title, id, ownerId)
    .run();

  return getDocument(db, ownerId, publicId);
}

export async function setDocumentSharing(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  shared: boolean,
): Promise<DocumentRecord | null> {
  const shareId = shared ? createPublicId() : null;
  const updated = await db
    .prepare(
      `UPDATE documents
       SET share_id = CASE
             WHEN ? = 1 THEN COALESCE(share_id, ?)
             ELSE NULL
           END,
           shared_at = CASE
             WHEN ? = 1 THEN COALESCE(shared_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ELSE NULL
           END
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING public_id`,
    )
    .bind(shared ? 1 : 0, shareId, shared ? 1 : 0, id, ownerId)
    .first<{ public_id: PublicId }>();

  return updated ? getDocument(db, ownerId, updated.public_id) : null;
}

export async function setDocumentPinned(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  pinned: boolean,
): Promise<DocumentRecord | null> {
  const updated = await db
    .prepare(
      `UPDATE documents
       SET is_pinned = ?
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING public_id`,
    )
    .bind(pinned ? 1 : 0, id, ownerId)
    .first<{ public_id: PublicId }>();

  return updated ? getDocument(db, ownerId, updated.public_id) : null;
}

export async function getSharedDocument(
  db: D1Database,
  shareId: PublicId,
): Promise<SharedDocument | null> {
  const row = await db
    .prepare(
      `SELECT title, content_html, content_text, updated_at
       FROM documents
       WHERE share_id = ? AND deleted_at IS NULL`,
    )
    .bind(shareId)
    .first<{
      title: string;
      content_html: string;
      content_text: string;
      updated_at: string;
    }>();

  if (!row) return null;
  return {
    title: row.title,
    contentHtml: row.content_html,
    contentText: row.content_text,
    updatedAt: toIso(row.updated_at),
  };
}

export interface UpdateDocumentInput {
  title?: string;
  content?: Record<string, unknown>;
  contentHtml?: string;
  contentText?: string;
}

export type UpdateDocumentResult =
  | { kind: 'updated'; document: DocumentRecord }
  | { kind: 'not_found' }
  | { kind: 'conflict'; currentVersion: number };

export async function updateDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  expectedVersion: number,
  input: UpdateDocumentInput,
): Promise<UpdateDocumentResult> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof input.title === 'string') {
    sets.push('title = ?');
    params.push(input.title);
  }
  if (input.content) {
    sets.push('content_json = ?');
    params.push(JSON.stringify(input.content));
  }
  if (typeof input.contentHtml === 'string') {
    sets.push('content_html = ?');
    params.push(input.contentHtml);
  }
  if (typeof input.contentText === 'string') {
    sets.push('content_text = ?');
    params.push(input.contentText);
  }

  if (sets.length === 0) {
    const document = await getDocument(db, ownerId, id);
    return document ? { kind: 'updated', document } : { kind: 'not_found' };
  }

  const current = await getVersionSource(db, ownerId, id);
  if (!current) return { kind: 'not_found' };
  if (current.version !== expectedVersion) {
    return { kind: 'conflict', currentVersion: current.version };
  }

  sets.push('version = version + 1');
  sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);

  const updated = await db
    .prepare(
      `UPDATE documents
       SET ${sets.join(', ')}
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL AND version = ?
       RETURNING public_id`,
    )
    .bind(...params, id, ownerId, expectedVersion)
    .first<{ public_id: PublicId }>();

  if (updated) {
    await captureVersionIfDue(db, current);
    const document = await getDocument(db, ownerId, updated.public_id);
    if (document) return { kind: 'updated', document };
  }

  const latest = await db
    .prepare(
      `SELECT version
       FROM documents
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<{ version: number }>();

  return latest ? { kind: 'conflict', currentVersion: latest.version } : { kind: 'not_found' };
}

export async function createDocumentCheckpoint(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<number | null> {
  const current = await getVersionSource(db, ownerId, id);
  if (!current) return null;
  await captureVersion(db, current);
  return current.version;
}

export type RestoreDocumentVersionResult =
  | { kind: 'updated'; document: DocumentRecord }
  | { kind: 'not_found' }
  | { kind: 'version_not_found' }
  | { kind: 'conflict'; currentVersion: number };

export async function restoreDocumentVersion(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  version: number,
  expectedVersion: number,
): Promise<RestoreDocumentVersionResult> {
  const current = await getVersionSource(db, ownerId, id);
  if (!current) return { kind: 'not_found' };
  if (current.version !== expectedVersion) {
    return { kind: 'conflict', currentVersion: current.version };
  }

  const snapshot = await getDocumentVersion(db, ownerId, id, version);
  if (!snapshot) return { kind: 'version_not_found' };

  await captureVersion(db, current);

  const restored = await db
    .prepare(
      `UPDATE documents
       SET title = ?,
           content_json = ?,
           content_html = ?,
           content_text = ?,
           version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL AND version = ?
       RETURNING public_id`,
    )
    .bind(
      snapshot.title,
      JSON.stringify(snapshot.content),
      snapshot.contentHtml,
      snapshot.contentText,
      id,
      ownerId,
      expectedVersion,
    )
    .first<{ public_id: PublicId }>();

  if (!restored) {
    const latest = await getVersionSource(db, ownerId, id);
    return latest ? { kind: 'conflict', currentVersion: latest.version } : { kind: 'not_found' };
  }

  const document = await getDocument(db, ownerId, restored.public_id);
  return document ? { kind: 'updated', document } : { kind: 'not_found' };
}

export async function deleteDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE documents
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function restoreDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<DocumentRecord | null> {
  const restored = await db
    .prepare(
      `UPDATE documents
       SET deleted_at = NULL,
           version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NOT NULL
       RETURNING public_id`,
    )
    .bind(id, ownerId)
    .first<{ public_id: PublicId }>();

  return restored ? getDocument(db, ownerId, restored.public_id) : null;
}

export interface PermanentDeleteResult {
  deletedAttachmentCount: number;
  objectKeys: string[];
}

export async function permanentlyDeleteDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<PermanentDeleteResult | null> {
  const document = await db
    .prepare(
      `SELECT id
       FROM documents
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(id, ownerId)
    .first<{ id: number }>();
  if (!document) return null;

  const attachmentRows = await db
    .prepare(
      `SELECT object_key
       FROM document_attachments
       WHERE owner_id = ? AND document_id = ?`,
    )
    .bind(ownerId, document.id)
    .all<{ object_key: string }>();
  const objectKeys = (attachmentRows.results ?? []).map((row) => row.object_key);

  const [, attachmentResult, documentResult] = await db.batch([
    db
      .prepare(
        `DELETE FROM document_versions
         WHERE owner_id = ?
           AND document_id = (
             SELECT id FROM documents
             WHERE public_id = ? AND owner_id = ? AND deleted_at IS NOT NULL
           )`,
      )
      .bind(ownerId, id, ownerId),
    db
      .prepare(
        `DELETE FROM document_attachments
         WHERE owner_id = ?
           AND document_id = (
             SELECT id FROM documents
             WHERE public_id = ? AND owner_id = ? AND deleted_at IS NOT NULL
           )`,
      )
      .bind(ownerId, id, ownerId),
    db
      .prepare(
        `DELETE FROM documents
         WHERE public_id = ? AND owner_id = ? AND deleted_at IS NOT NULL`,
      )
      .bind(id, ownerId),
  ]);

  if ((documentResult.meta.changes ?? 0) === 0) return null;
  return {
    deletedAttachmentCount: attachmentResult.meta.changes ?? 0,
    objectKeys,
  };
}

export async function batchUpdateDocuments(
  db: D1Database,
  ownerId: number,
  ids: PublicId[],
  action:
    | { kind: 'move'; folderId: PublicId | null }
    | { kind: 'favorite'; favorite: boolean }
    | { kind: 'delete' }
    | { kind: 'restore' },
): Promise<{ requestedCount: number; updatedCount: number; items: DocumentSummary[] }> {
  const placeholders = ids.map(() => '?').join(', ');
  let statement: D1PreparedStatement;

  if (action.kind === 'move') {
    statement = db
      .prepare(
        `UPDATE documents
         SET folder_id = (
           SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
         )
         WHERE owner_id = ? AND deleted_at IS NULL AND public_id IN (${placeholders})
         RETURNING public_id`,
      )
      .bind(ownerId, action.folderId, ownerId, ...ids);
  } else if (action.kind === 'favorite') {
    statement = db
      .prepare(
        `UPDATE documents
         SET is_favorite = ?
         WHERE owner_id = ? AND deleted_at IS NULL AND public_id IN (${placeholders})
         RETURNING public_id`,
      )
      .bind(action.favorite ? 1 : 0, ownerId, ...ids);
  } else if (action.kind === 'delete') {
    statement = db
      .prepare(
        `UPDATE documents
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND deleted_at IS NULL AND public_id IN (${placeholders})
         RETURNING public_id`,
      )
      .bind(ownerId, ...ids);
  } else {
    statement = db
      .prepare(
        `UPDATE documents
         SET deleted_at = NULL,
             version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND deleted_at IS NOT NULL AND public_id IN (${placeholders})
         RETURNING public_id`,
      )
      .bind(ownerId, ...ids);
  }

  const result = await statement.all<{ public_id: PublicId }>();
  const updatedIds = (result.results ?? []).map((row) => row.public_id);
  if (updatedIds.length === 0 || action.kind === 'delete') {
    return {
      requestedCount: ids.length,
      updatedCount: updatedIds.length,
      items: [],
    };
  }

  const summaryPlaceholders = updatedIds.map(() => '?').join(', ');
  const summaries = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents d
       ${DOCUMENT_JOINS}
       WHERE d.owner_id = ? AND d.deleted_at IS NULL AND d.public_id IN (${summaryPlaceholders})
       ORDER BY d.id ASC`,
    )
    .bind(ownerId, ...updatedIds)
    .all<DocumentRow>();

  return {
    requestedCount: ids.length,
    updatedCount: updatedIds.length,
    items: (summaries.results ?? []).map(toSummary),
  };
}

export async function moveDocument(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  folderId: PublicId | null,
  parentId: PublicId | null = null,
): Promise<DocumentRecord | null> {
  if (id === parentId) return null;
  if (
    parentId &&
    (await db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id FROM documents
           WHERE owner_id = ? AND public_id = ?
           UNION ALL
           SELECT child.id
           FROM documents child
           JOIN subtree ON child.parent_document_id = subtree.id
           WHERE child.owner_id = ?
         )
         SELECT 1 AS found FROM subtree
         WHERE id = (
           SELECT id FROM documents
           WHERE owner_id = ? AND public_id = ? AND deleted_at IS NULL
         )
         LIMIT 1`,
      )
      .bind(ownerId, id, ownerId, ownerId, parentId)
      .first<{ found: number }>())
  ) {
    return null;
  }

  const moved = await db
    .prepare(
      `UPDATE documents
       SET folder_id = (
         SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
       ),
       parent_document_id = (
         SELECT id FROM documents
         WHERE owner_id = ? AND public_id = ? AND deleted_at IS NULL
       )
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING public_id`,
    )
    .bind(ownerId, folderId, ownerId, parentId, id, ownerId)
    .first<{ public_id: PublicId }>();

  return moved ? getDocument(db, ownerId, moved.public_id) : null;
}

export async function moveDocumentsToFolder(
  db: D1Database,
  ownerId: number,
  ids: PublicId[],
  folderId: PublicId | null,
): Promise<PublicId[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `UPDATE documents
       SET folder_id = (
         SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
       ),
       parent_document_id = NULL
       WHERE owner_id = ? AND deleted_at IS NULL AND public_id IN (${placeholders})
       RETURNING public_id`,
    )
    .bind(ownerId, folderId, ownerId, ...ids)
    .all<{ public_id: PublicId }>();
  return (result.results ?? []).map((row) => row.public_id);
}

export async function setDocumentFavorite(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  favorite: boolean,
): Promise<DocumentRecord | null> {
  const updated = await db
    .prepare(
      `UPDATE documents
       SET is_favorite = ?
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING public_id`,
    )
    .bind(favorite ? 1 : 0, id, ownerId)
    .first<{ public_id: PublicId }>();

  return updated ? getDocument(db, ownerId, updated.public_id) : null;
}
