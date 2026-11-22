import type { AuthUser } from '../../shared/types';

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string;
}

interface SessionUserRow extends UserRow {
  expires_at: string;
}

export interface ExternalIdentity {
  provider: 'google' | 'github';
  providerSub: string;
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

export async function upsertExternalUser(
  db: D1Database,
  identity: ExternalIdentity,
): Promise<AuthUser> {
  const user = await db
    .prepare(
      `INSERT INTO users (email, display_name, avatar_url)
       VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id, email, display_name, avatar_url`,
    )
    .bind(identity.email, identity.name, identity.avatarUrl)
    .first<UserRow>();

  if (!user) throw new Error('Failed to upsert user');

  await db
    .prepare(
      `INSERT INTO user_identities (provider, provider_sub, user_id)
       VALUES (?, ?, ?)
       ON CONFLICT(provider, provider_sub) DO UPDATE SET
         user_id = excluded.user_id,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(identity.provider, identity.providerSub, user.id)
    .run();

  return toAuthUser(user);
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
      `SELECT u.id, u.email, u.display_name, u.avatar_url, s.expires_at
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
