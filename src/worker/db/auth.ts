import type { AuthUser } from '../../shared/types';

interface UserRow {
  id: number;
  google_sub: string;
  email: string;
  display_name: string;
  avatar_url: string;
}

interface SessionUserRow extends UserRow {
  expires_at: string;
}

export interface GoogleIdentity {
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

export async function upsertGoogleUser(
  db: D1Database,
  identity: GoogleIdentity,
): Promise<AuthUser> {
  const row = await db
    .prepare(
      `INSERT INTO users (google_sub, email, display_name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id, google_sub, email, display_name, avatar_url`,
    )
    .bind(identity.googleSub, identity.email, identity.name, identity.avatarUrl)
    .first<UserRow>();

  if (!row) throw new Error('Failed to upsert Google user');
  return toAuthUser(row);
}

export async function claimOwnerlessDocuments(db: D1Database, ownerId: number): Promise<number> {
  const result = await db
    .prepare('UPDATE documents SET owner_id = ? WHERE owner_id IS NULL')
    .bind(ownerId)
    .run();

  return result.meta.changes ?? 0;
}

export async function createSession(
  db: D1Database,
  tokenHash: string,
  userId: number,
  expiresAt: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()),
    db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(tokenHash, userId, expiresAt),
  ]);
}

export async function getUserBySession(
  db: D1Database,
  tokenHash: string,
): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.google_sub, u.email, u.display_name, u.avatar_url, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionUserRow>();

  return row ? toAuthUser(row) : null;
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
