import type { FolderRow, FolderSummary } from '../types';

function toIso(value: string): string {
  if (value.includes('T')) return value;
  return `${value.replace(' ', 'T')}Z`;
}

function toFolder(row: FolderRow): FolderSummary {
  return {
    id: row.id,
    name: row.name,
    documentCount: Number(row.document_count ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listFolders(db: D1Database, ownerId: number) {
  const result = await db
    .prepare(
      `SELECT
         f.id,
         f.owner_id,
         f.name,
         f.created_at,
         f.updated_at,
         COUNT(d.id) AS document_count
       FROM folders f
       LEFT JOIN documents d
         ON d.folder_id = f.id
        AND d.owner_id = f.owner_id
        AND d.deleted_at IS NULL
       WHERE f.owner_id = ?
       GROUP BY f.id
       ORDER BY f.name COLLATE NOCASE ASC, f.id ASC`,
    )
    .bind(ownerId)
    .all<FolderRow>();

  return { items: (result.results ?? []).map(toFolder) };
}

export async function folderExists(
  db: D1Database,
  ownerId: number,
  folderId: number,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM folders WHERE id = ? AND owner_id = ?')
    .bind(folderId, ownerId)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

export async function createFolder(
  db: D1Database,
  ownerId: number,
  name: string,
): Promise<FolderSummary | null> {
  const row = await db
    .prepare(
      `INSERT INTO folders (owner_id, name)
       VALUES (?, ?)
       ON CONFLICT (owner_id, name) DO NOTHING
       RETURNING id, owner_id, name, created_at, updated_at, 0 AS document_count`,
    )
    .bind(ownerId, name)
    .first<FolderRow>();

  return row ? toFolder(row) : null;
}

export type RenameFolderResult =
  { kind: 'renamed'; folder: FolderSummary } | { kind: 'not_found' } | { kind: 'conflict' };

export async function renameFolder(
  db: D1Database,
  ownerId: number,
  id: number,
  name: string,
): Promise<RenameFolderResult> {
  const row = await db
    .prepare(
      `UPDATE OR IGNORE folders
       SET name = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND owner_id = ?
       RETURNING id, owner_id, name, created_at, updated_at, 0 AS document_count`,
    )
    .bind(name, id, ownerId)
    .first<FolderRow>();

  if (row) {
    const folder = toFolder(row);
    const count = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM documents
         WHERE owner_id = ? AND folder_id = ? AND deleted_at IS NULL`,
      )
      .bind(ownerId, id)
      .first<{ count: number }>();
    folder.documentCount = Number(count?.count ?? 0);
    return { kind: 'renamed', folder };
  }

  const existing = await db
    .prepare('SELECT 1 AS found FROM folders WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .first<{ found: number }>();
  return existing ? { kind: 'conflict' } : { kind: 'not_found' };
}

export async function deleteFolder(db: D1Database, ownerId: number, id: number): Promise<boolean> {
  const [movedDocuments, deletedFolder] = await db.batch([
    db
      .prepare('UPDATE documents SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?')
      .bind(id, ownerId),
    db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').bind(id, ownerId),
  ]);

  return Boolean((deletedFolder.meta.changes ?? 0) > 0 && (movedDocuments.meta.changes ?? 0) >= 0);
}
