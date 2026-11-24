import type { FolderRow, FolderSummary } from '../types';
import type { PublicId } from '../../shared/ids';
import { createPublicId } from './public-ids';

export const MAX_FOLDER_DEPTH = 5;

function toIso(value: string): string {
  if (value.includes('T')) return value;
  return `${value.replace(' ', 'T')}Z`;
}

function toFolder(row: FolderRow): FolderSummary {
  return {
    id: row.public_id,
    parentId: row.parent_public_id,
    name: row.name,
    documentCount: Number(row.document_count ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

interface FolderReference {
  id: number;
  public_id: PublicId;
  parent_id: number | null;
}

async function getFolderReference(
  db: D1Database,
  ownerId: number,
  publicId: PublicId,
): Promise<FolderReference | null> {
  return db
    .prepare(
      `SELECT id, public_id, parent_id
       FROM folders
       WHERE owner_id = ? AND public_id = ?`,
    )
    .bind(ownerId, publicId)
    .first<FolderReference>();
}

async function getFolderDepth(db: D1Database, ownerId: number, folderId: number): Promise<number> {
  const row = await db
    .prepare(
      `WITH RECURSIVE ancestors(id, parent_id, depth) AS (
         SELECT id, parent_id, 1
         FROM folders
         WHERE owner_id = ? AND id = ?
         UNION ALL
         SELECT f.id, f.parent_id, ancestors.depth + 1
         FROM folders f
         JOIN ancestors ON f.id = ancestors.parent_id
         WHERE f.owner_id = ?
       )
       SELECT MAX(depth) AS depth FROM ancestors`,
    )
    .bind(ownerId, folderId, ownerId)
    .first<{ depth: number | null }>();
  return Number(row?.depth ?? 0);
}

async function getSubtreeHeight(
  db: D1Database,
  ownerId: number,
  folderId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `WITH RECURSIVE subtree(id, depth) AS (
         SELECT id, 1
         FROM folders
         WHERE owner_id = ? AND id = ?
         UNION ALL
         SELECT f.id, subtree.depth + 1
         FROM folders f
         JOIN subtree ON f.parent_id = subtree.id
         WHERE f.owner_id = ?
       )
       SELECT MAX(depth) AS height FROM subtree`,
    )
    .bind(ownerId, folderId, ownerId)
    .first<{ height: number | null }>();
  return Number(row?.height ?? 0);
}

async function isDescendant(
  db: D1Database,
  ownerId: number,
  folderId: number,
  possibleAncestorId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `WITH RECURSIVE ancestors(id, parent_id) AS (
         SELECT id, parent_id
         FROM folders
         WHERE owner_id = ? AND id = ?
         UNION ALL
         SELECT f.id, f.parent_id
         FROM folders f
         JOIN ancestors ON f.id = ancestors.parent_id
         WHERE f.owner_id = ?
       )
       SELECT 1 AS found
       FROM ancestors
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(ownerId, folderId, ownerId, possibleAncestorId)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

async function getFolderSummary(
  db: D1Database,
  ownerId: number,
  publicId: PublicId,
): Promise<FolderSummary | null> {
  const row = await db
    .prepare(
      `SELECT
         f.id,
         f.public_id,
         f.owner_id,
         f.parent_id,
         p.public_id AS parent_public_id,
         f.name,
         f.created_at,
         f.updated_at,
         COUNT(d.id) AS document_count
       FROM folders f
       LEFT JOIN folders p
         ON p.id = f.parent_id
        AND p.owner_id = f.owner_id
       LEFT JOIN documents d
         ON d.folder_id = f.id
        AND d.owner_id = f.owner_id
        AND d.deleted_at IS NULL
       WHERE f.owner_id = ? AND f.public_id = ?
       GROUP BY f.id`,
    )
    .bind(ownerId, publicId)
    .first<FolderRow>();
  return row ? toFolder(row) : null;
}

export async function listFolders(db: D1Database, ownerId: number) {
  const result = await db
    .prepare(
      `SELECT
         f.id,
         f.public_id,
         f.owner_id,
         f.parent_id,
         p.public_id AS parent_public_id,
         f.name,
         f.created_at,
         f.updated_at,
         COUNT(d.id) AS document_count
       FROM folders f
       LEFT JOIN folders p
         ON p.id = f.parent_id
        AND p.owner_id = f.owner_id
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
  folderId: PublicId,
): Promise<boolean> {
  return Boolean(await getFolderReference(db, ownerId, folderId));
}

export type CreateFolderResult =
  | { kind: 'created'; folder: FolderSummary }
  | { kind: 'conflict' }
  | { kind: 'parent_not_found' }
  | { kind: 'too_deep' };

export async function createFolder(
  db: D1Database,
  ownerId: number,
  name: string,
  parentId: PublicId | null,
): Promise<CreateFolderResult> {
  let parent: FolderReference | null = null;
  if (parentId) {
    parent = await getFolderReference(db, ownerId, parentId);
    if (!parent) return { kind: 'parent_not_found' };
    if ((await getFolderDepth(db, ownerId, parent.id)) >= MAX_FOLDER_DEPTH) {
      return { kind: 'too_deep' };
    }
  }

  const publicId = createPublicId();
  const row = await db
    .prepare(
      `INSERT INTO folders (public_id, owner_id, parent_id, name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (owner_id, COALESCE(parent_id, 0), name) DO NOTHING
       RETURNING
         id,
         public_id,
         owner_id,
         parent_id,
         ? AS parent_public_id,
         name,
         created_at,
         updated_at,
         0 AS document_count`,
    )
    .bind(publicId, ownerId, parent?.id ?? null, name, parentId)
    .first<FolderRow>();

  return row ? { kind: 'created', folder: toFolder(row) } : { kind: 'conflict' };
}

export type RenameFolderResult =
  { kind: 'renamed'; folder: FolderSummary } | { kind: 'not_found' } | { kind: 'conflict' };

export async function renameFolder(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  name: string,
): Promise<RenameFolderResult> {
  const current = await getFolderReference(db, ownerId, id);
  if (!current) return { kind: 'not_found' };

  const updated = await db
    .prepare(
      `UPDATE OR IGNORE folders
       SET name = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND owner_id = ?
       RETURNING public_id`,
    )
    .bind(name, current.id, ownerId)
    .first<{ public_id: PublicId }>();

  if (!updated) return { kind: 'conflict' };
  const folder = await getFolderSummary(db, ownerId, updated.public_id);
  return folder ? { kind: 'renamed', folder } : { kind: 'not_found' };
}

export type MoveFolderResult =
  | { kind: 'moved'; folder: FolderSummary }
  | { kind: 'not_found' }
  | { kind: 'parent_not_found' }
  | { kind: 'cycle' }
  | { kind: 'too_deep' }
  | { kind: 'conflict' };

export async function moveFolder(
  db: D1Database,
  ownerId: number,
  id: PublicId,
  parentId: PublicId | null,
): Promise<MoveFolderResult> {
  const folder = await getFolderReference(db, ownerId, id);
  if (!folder) return { kind: 'not_found' };

  let parent: FolderReference | null = null;
  if (parentId) {
    parent = await getFolderReference(db, ownerId, parentId);
    if (!parent) return { kind: 'parent_not_found' };
    if (parent.id === folder.id || (await isDescendant(db, ownerId, parent.id, folder.id))) {
      return { kind: 'cycle' };
    }
  }

  const parentDepth = parent ? await getFolderDepth(db, ownerId, parent.id) : 0;
  const subtreeHeight = await getSubtreeHeight(db, ownerId, folder.id);
  if (parentDepth + subtreeHeight > MAX_FOLDER_DEPTH) {
    return { kind: 'too_deep' };
  }

  if (folder.parent_id === (parent?.id ?? null)) {
    const current = await getFolderSummary(db, ownerId, id);
    return current ? { kind: 'moved', folder: current } : { kind: 'not_found' };
  }

  const moved = await db
    .prepare(
      `UPDATE OR IGNORE folders
       SET parent_id = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND owner_id = ?
       RETURNING public_id`,
    )
    .bind(parent?.id ?? null, folder.id, ownerId)
    .first<{ public_id: PublicId }>();

  if (!moved) return { kind: 'conflict' };
  const result = await getFolderSummary(db, ownerId, moved.public_id);
  return result ? { kind: 'moved', folder: result } : { kind: 'not_found' };
}

export interface DeleteFolderResult {
  deleted: boolean;
  deletedFolderCount: number;
  movedDocumentCount: number;
}

export async function deleteFolder(
  db: D1Database,
  ownerId: number,
  id: PublicId,
): Promise<DeleteFolderResult> {
  const folder = await getFolderReference(db, ownerId, id);
  if (!folder) {
    return { deleted: false, deletedFolderCount: 0, movedDocumentCount: 0 };
  }

  const [movedDocuments, deletedFolders] = await db.batch([
    db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id
           FROM folders
           WHERE owner_id = ? AND id = ?
           UNION ALL
           SELECT f.id
           FROM folders f
           JOIN subtree ON f.parent_id = subtree.id
           WHERE f.owner_id = ?
         )
         UPDATE documents
         SET folder_id = NULL
         WHERE owner_id = ? AND folder_id IN (SELECT id FROM subtree)`,
      )
      .bind(ownerId, folder.id, ownerId, ownerId),
    db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id
           FROM folders
           WHERE owner_id = ? AND id = ?
           UNION ALL
           SELECT f.id
           FROM folders f
           JOIN subtree ON f.parent_id = subtree.id
           WHERE f.owner_id = ?
         )
         DELETE FROM folders
         WHERE owner_id = ? AND id IN (SELECT id FROM subtree)`,
      )
      .bind(ownerId, folder.id, ownerId, ownerId),
  ]);

  return {
    deleted: Number(deletedFolders.meta.changes ?? 0) > 0,
    deletedFolderCount: Number(deletedFolders.meta.changes ?? 0),
    movedDocumentCount: Number(movedDocuments.meta.changes ?? 0),
  };
}
