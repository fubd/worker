import type { DocumentRecord, DocumentRow, DocumentSummary } from '../types';

const LIST_COLUMNS = `
  id, owner_id, title, substr(content_text, 1, 140) AS content_text,
  folder_id, is_favorite, version, created_at, updated_at, deleted_at
`;

const FULL_COLUMNS = `
  id, owner_id, title, content_json, content_html, content_text,
  folder_id, is_favorite, version, created_at, updated_at, deleted_at
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
    id: row.id,
    title: row.title,
    excerpt: row.content_text.trim(),
    folderId: row.folder_id,
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
    folderId?: number | null;
    query?: string;
    favoriteOnly?: boolean;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions = ['owner_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [ownerId];

  if (options.folderId === null) {
    conditions.push('folder_id IS NULL');
  } else if (typeof options.folderId === 'number') {
    conditions.push('folder_id = ?');
    params.push(options.folderId);
  }

  if (options.favoriteOnly) {
    conditions.push('is_favorite = 1');
  }

  const query = options.query?.trim();
  if (query) {
    conditions.push(
      '(instr(lower(title), lower(?)) > 0 OR instr(lower(content_text), lower(?)) > 0)',
    );
    params.push(query, query);
  }

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_favorite DESC, updated_at DESC, id DESC
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
       FROM documents
       WHERE owner_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(ownerId, limit, offset)
    .all<DocumentRow>();

  return { items: (result.results ?? []).map(toSummary) };
}

export async function getDocument(
  db: D1Database,
  ownerId: number,
  id: number,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${FULL_COLUMNS}
       FROM documents
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function createDocument(
  db: D1Database,
  ownerId: number,
  title: string,
  folderId: number | null = null,
): Promise<DocumentRecord> {
  const row = await db
    .prepare(
      `INSERT INTO documents (
         owner_id, folder_id, title, content_json, content_html, content_text
       )
       VALUES (?, ?, ?, ?, '<p></p>', '')
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(ownerId, folderId, title, EMPTY_CONTENT_JSON)
    .first<DocumentRow>();

  if (!row) {
    throw new Error('Failed to create document');
  }

  return toDocument(row);
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
  id: number,
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

  const row = await db
    .prepare(
      `UPDATE documents
       SET ${sets.join(', ')}
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND version = ?
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(...params, id, ownerId, expectedVersion)
    .first<DocumentRow>();

  if (row) return { kind: 'updated', document: toDocument(row) };

  const current = await db
    .prepare(
      `SELECT version
       FROM documents
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .first<{ version: number }>();

  return current ? { kind: 'conflict', currentVersion: current.version } : { kind: 'not_found' };
}

export async function deleteDocument(
  db: D1Database,
  ownerId: number,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE documents
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, ownerId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function restoreDocument(
  db: D1Database,
  ownerId: number,
  id: number,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `UPDATE documents
       SET deleted_at = NULL,
           version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function moveDocument(
  db: D1Database,
  ownerId: number,
  id: number,
  folderId: number | null,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `UPDATE documents
       SET folder_id = ?
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(folderId, id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function setDocumentFavorite(
  db: D1Database,
  ownerId: number,
  id: number,
  favorite: boolean,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(
      `UPDATE documents
       SET is_favorite = ?
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(favorite ? 1 : 0, id, ownerId)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}
