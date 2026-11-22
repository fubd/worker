import type { AuthUser } from '../../shared/types';

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string;
  has_password: number;
}

interface PasswordCredentialRow {
  algorithm: string;
  iterations: number;
  salt: string;
  password_hash: string;
}

export interface PasswordRateLimit {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
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
    hasPassword: row.has_password === 1,
  };
}

const USER_SELECT = `
  SELECT
    u.id,
    u.email,
    u.display_name,
    u.avatar_url,
    EXISTS (
      SELECT 1 FROM password_credentials pc WHERE pc.user_id = u.id
    ) AS has_password
  FROM users u
`;

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

  const hasPassword = await db
    .prepare('SELECT 1 AS present FROM password_credentials WHERE user_id = ?')
    .bind(user.id)
    .first<{ present: number }>();

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

  return toAuthUser({ ...user, has_password: hasPassword ? 1 : 0 });
}

export async function findUserByEmail(db: D1Database, email: string): Promise<AuthUser | null> {
  const row = await db
    .prepare(`${USER_SELECT} WHERE u.email = ? COLLATE NOCASE`)
    .bind(email)
    .first<UserRow>();
  return row ? toAuthUser(row) : null;
}

export async function getPasswordCredential(
  db: D1Database,
  userId: number,
): Promise<{
  algorithm: string;
  iterations: number;
  salt: string;
  passwordHash: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT algorithm, iterations, salt, password_hash
       FROM password_credentials
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<PasswordCredentialRow>();

  return row
    ? {
        algorithm: row.algorithm,
        iterations: row.iterations,
        salt: row.salt,
        passwordHash: row.password_hash,
      }
    : null;
}

export async function setPasswordCredential(
  db: D1Database,
  userId: number,
  credential: {
    algorithm: string;
    iterations: number;
    salt: string;
    passwordHash: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO password_credentials (
         user_id, algorithm, iterations, salt, password_hash
       )
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         algorithm = excluded.algorithm,
         iterations = excluded.iterations,
         salt = excluded.salt,
         password_hash = excluded.password_hash,
         updated_at = datetime('now')`,
    )
    .bind(
      userId,
      credential.algorithm,
      credential.iterations,
      credential.salt,
      credential.passwordHash,
    )
    .run();
}

export async function getPasswordRateLimit(
  db: D1Database,
  key: string,
): Promise<PasswordRateLimit | null> {
  const row = await db
    .prepare(
      `SELECT attempts, window_started_at, blocked_until
       FROM auth_rate_limits
       WHERE key = ?`,
    )
    .bind(key)
    .first<{
      attempts: number;
      window_started_at: number;
      blocked_until: number;
    }>();

  return row
    ? {
        attempts: row.attempts,
        windowStartedAt: row.window_started_at,
        blockedUntil: row.blocked_until,
      }
    : null;
}

export async function recordPasswordFailure(
  db: D1Database,
  key: string,
  now: number,
  policy: {
    maxAttempts: number;
    windowMs: number;
    blockMs: number;
  },
): Promise<PasswordRateLimit> {
  const current = await getPasswordRateLimit(db, key);
  const windowExpired = !current || now - current.windowStartedAt >= policy.windowMs;
  const attempts = windowExpired ? 1 : current.attempts + 1;
  const windowStartedAt = windowExpired ? now : current.windowStartedAt;
  const blockedUntil = attempts >= policy.maxAttempts ? now + policy.blockMs : 0;

  await db
    .prepare(
      `INSERT INTO auth_rate_limits (key, attempts, window_started_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         attempts = excluded.attempts,
         window_started_at = excluded.window_started_at,
         blocked_until = excluded.blocked_until`,
    )
    .bind(key, attempts, windowStartedAt, blockedUntil)
    .run();

  return { attempts, windowStartedAt, blockedUntil };
}

export async function clearPasswordRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM auth_rate_limits WHERE key = ?').bind(key).run();
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
      `${USER_SELECT}
       JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<UserRow>();

  return row ? toAuthUser(row) : null;
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
