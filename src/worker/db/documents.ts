import type { DocumentRecord, DocumentRow, DocumentSummary } from '../types';
import type { DocumentId, FolderId } from '../../shared/ids';
import { createDocumentId } from './public-ids';

const LIST_COLUMNS = `
  d.id, d.public_id, d.owner_id, d.title, substr(d.content_text, 1, 140) AS content_text,
  d.folder_id, f.public_id AS folder_public_id,
  d.is_favorite, d.version, d.created_at, d.updated_at, d.deleted_at
`;

const FULL_COLUMNS = `
  d.id, d.public_id, d.owner_id, d.title, d.content_json, d.content_html, d.content_text,
  d.folder_id, f.public_id AS folder_public_id,
  d.is_favorite, d.version, d.created_at, d.updated_at, d.deleted_at
`;

const EMPTY_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

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
    favorite: row.is_favorite === 1,
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

export async function listDocuments(
  db: D1Database,
  ownerId: number,
  options: {
    limit?: number;
    offset?: number;
    folderId?: FolderId | null;
    query?: string;
    favoriteOnly?: boolean;
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

  if (options.favoriteOnly) {
    conditions.push('d.is_favorite = 1');
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
       LEFT JOIN folders f
         ON f.id = d.folder_id
        AND f.owner_id = d.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.is_favorite DESC, d.updated_at DESC, d.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<DocumentRow>();

  return { items: (result.results ?? []).map(toSummary) };
}

export async function listDeletedDocuments(
  db: D1Database,
  ownerId: number,
  options: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents d
       LEFT JOIN folders f
         ON f.id = d.folder_id
        AND f.owner_id = d.owner_id
       WHERE d.owner_id = ? AND d.deleted_at IS NOT NULL
       ORDER BY d.deleted_at DESC, d.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(ownerId, limit, offset)
    .all<DocumentRow>();

  return { items: (result.results ?? []).map(toSummary) };
}

export async function getDocument(
  db: D1Database,
  ownerId: number,
  id: DocumentId,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${FULL_COLUMNS}
       FROM documents d
       LEFT JOIN folders f
         ON f.id = d.folder_id
        AND f.owner_id = d.owner_id
       WHERE d.public_id = ? AND d.owner_id = ? AND d.deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function createDocument(
  db: D1Database,
  ownerId: number,
  title: string,
  folderId: FolderId | null = null,
): Promise<DocumentRecord> {
  const publicId = createDocumentId();
  await db
    .prepare(
      `INSERT INTO documents (
         public_id, owner_id, folder_id, title, content_json, content_html, content_text
       )
       VALUES (
         ?, ?, (
           SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
         ), ?, ?, '<p></p>', ''
       )`,
    )
    .bind(publicId, ownerId, ownerId, folderId, title, EMPTY_CONTENT_JSON)
    .run();

  const document = await getDocument(db, ownerId, publicId);
  if (!document) {
    throw new Error('Failed to create document');
  }

  return document;
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
  id: DocumentId,
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
    .first<{ public_id: DocumentId }>();

  if (updated) {
    const document = await getDocument(db, ownerId, updated.public_id);
    if (document) return { kind: 'updated', document };
  }

  const current = await db
    .prepare(
      `SELECT version
       FROM documents
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<{ version: number }>();

  return current ? { kind: 'conflict', currentVersion: current.version } : { kind: 'not_found' };
}

export async function deleteDocument(
  db: D1Database,
  ownerId: number,
  id: DocumentId,
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
  id: DocumentId,
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
    .first<{ public_id: DocumentId }>();

  return restored ? getDocument(db, ownerId, restored.public_id) : null;
}

export async function moveDocument(
  db: D1Database,
  ownerId: number,
  id: DocumentId,
  folderId: FolderId | null,
): Promise<DocumentRecord | null> {
  const moved = await db
    .prepare(
      `UPDATE documents
       SET folder_id = (
         SELECT id FROM folders WHERE owner_id = ? AND public_id = ?
       )
       WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING public_id`,
    )
    .bind(ownerId, folderId, id, ownerId)
    .first<{ public_id: DocumentId }>();

  return moved ? getDocument(db, ownerId, moved.public_id) : null;
}

export async function setDocumentFavorite(
  db: D1Database,
  ownerId: number,
  id: DocumentId,
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
    .first<{ public_id: DocumentId }>();

  return updated ? getDocument(db, ownerId, updated.public_id) : null;
}
