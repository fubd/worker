import type { PublicId } from '../../shared/ids';
import type { DocumentVersionRecord, DocumentVersionSummary } from '../../shared/types';

const MAX_VERSIONS_PER_DOCUMENT = 30;
const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

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

interface VersionRow {
  version: number;
  title: string;
  content_json: string;
  content_html: string;
  content_text: string;
  created_at: string;
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

function toSummary(row: VersionRow): DocumentVersionSummary {
  return {
    version: row.version,
    title: row.title,
    excerpt: row.content_text.trim().slice(0, 140),
    createdAt: toIso(row.created_at),
  };
}

async function pruneVersions(db: D1Database, documentId: number): Promise<void> {
  await db
    .prepare(
      `DELETE FROM document_versions
       WHERE document_id = ?
         AND id NOT IN (
           SELECT id
           FROM document_versions
           WHERE document_id = ?
           ORDER BY version DESC
           LIMIT ?
         )`,
    )
    .bind(documentId, documentId, MAX_VERSIONS_PER_DOCUMENT)
    .run();
}

export async function captureVersion(db: D1Database, document: VersionSourceRow): Promise<void> {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO document_versions (
         document_id, owner_id, version, title,
         content_json, content_html, content_text, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      document.id,
      document.owner_id,
      document.version,
      document.title,
      document.content_json,
      document.content_html,
      document.content_text,
      document.updated_at,
    )
    .run();

  if ((inserted.meta.changes ?? 0) > 0) {
    await pruneVersions(db, document.id);
  }
}

export async function captureVersionIfDue(
  db: D1Database,
  document: VersionSourceRow,
): Promise<void> {
  const latest = await db
    .prepare(
      `SELECT version, created_at
       FROM document_versions
       WHERE document_id = ?
       ORDER BY version DESC
       LIMIT 1`,
    )
    .bind(document.id)
    .first<{ version: number; created_at: string }>();

  if (latest) {
    const latestCreatedAt = Date.parse(toIso(latest.created_at));
    if (
      latest.version === document.version ||
      (Number.isFinite(latestCreatedAt) && Date.now() - latestCreatedAt < CHECKPOINT_INTERVAL_MS)
    ) {
      return;
    }
  }

  await captureVersion(db, document);
}

export async function listDocumentVersions(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
): Promise<DocumentVersionSummary[]> {
  const result = await db
    .prepare(
      `SELECT
         dv.version,
         dv.title,
         dv.content_json,
         dv.content_html,
         dv.content_text,
         dv.created_at
       FROM document_versions dv
       JOIN documents d
         ON d.id = dv.document_id
        AND d.owner_id = dv.owner_id
       WHERE d.public_id = ?
         AND d.owner_id = ?
         AND d.deleted_at IS NULL
       ORDER BY dv.version DESC
       LIMIT ?`,
    )
    .bind(documentId, ownerId, MAX_VERSIONS_PER_DOCUMENT)
    .all<VersionRow>();

  return (result.results ?? []).map(toSummary);
}

export async function getDocumentVersion(
  db: D1Database,
  ownerId: number,
  documentId: PublicId,
  version: number,
): Promise<DocumentVersionRecord | null> {
  const row = await db
    .prepare(
      `SELECT
         dv.version,
         dv.title,
         dv.content_json,
         dv.content_html,
         dv.content_text,
         dv.created_at
       FROM document_versions dv
       JOIN documents d
         ON d.id = dv.document_id
        AND d.owner_id = dv.owner_id
       WHERE d.public_id = ?
         AND d.owner_id = ?
         AND d.deleted_at IS NULL
         AND dv.version = ?`,
    )
    .bind(documentId, ownerId, version)
    .first<VersionRow>();

  if (!row) return null;
  return {
    version: row.version,
    title: row.title,
    content: parseContent(row.content_json),
    contentHtml: row.content_html,
    contentText: row.content_text,
    createdAt: toIso(row.created_at),
  };
}
