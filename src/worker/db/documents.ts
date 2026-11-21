import type { DocumentRecord, DocumentRow, DocumentSummary } from '../types';

const LIST_COLUMNS = `
  id, title, substr(content_text, 1, 140) AS content_text,
  version, created_at, updated_at
`;

const FULL_COLUMNS = `
  id, title, content_json, content_html, content_text,
  version, created_at, updated_at
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
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
  options: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const result = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}
       FROM documents
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<DocumentRow>();

  return { items: (result.results ?? []).map(toSummary) };
}

export async function getDocument(db: D1Database, id: number): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(`SELECT ${FULL_COLUMNS} FROM documents WHERE id = ?`)
    .bind(id)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function createDocument(db: D1Database, title: string): Promise<DocumentRecord> {
  const row = await db
    .prepare(
      `INSERT INTO documents (title, content_json, content_html, content_text)
       VALUES (?, ?, '<p></p>', '')
       RETURNING ${FULL_COLUMNS}`,
    )
    .bind(title, EMPTY_CONTENT_JSON)
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

export async function updateDocument(
  db: D1Database,
  id: number,
  input: UpdateDocumentInput,
): Promise<DocumentRecord | null> {
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
    return getDocument(db, id);
  }

  sets.push('version = version + 1');
  sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);

  const row = await db
    .prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ? RETURNING ${FULL_COLUMNS}`)
    .bind(...params, id)
    .first<DocumentRow>();

  return row ? toDocument(row) : null;
}

export async function deleteDocument(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}
