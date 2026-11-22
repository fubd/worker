import type { AuthUser } from '../../shared/types';

interface UserRow {
  id: number;
  username: string | null;
  email: string | null;
  display_name: string;
  avatar_url: string;
  has_password: number;
  has_google: number;
  has_github: number;
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
    username: row.username,
    email: row.email,
    name: row.display_name,
    avatarUrl: row.avatar_url,
    hasPassword: row.has_password === 1,
    linkedProviders: [
      ...(row.has_google === 1 ? (['google'] as const) : []),
      ...(row.has_github === 1 ? (['github'] as const) : []),
    ],
  };
}

const USER_SELECT = `
  SELECT
    u.id,
    u.username,
    u.email,
    u.display_name,
    u.avatar_url,
    EXISTS (
      SELECT 1 FROM password_credentials pc WHERE pc.user_id = u.id
    ) AS has_password,
    EXISTS (
      SELECT 1 FROM user_identities ui
      WHERE ui.user_id = u.id AND ui.provider = 'google'
    ) AS has_google,
    EXISTS (
      SELECT 1 FROM user_identities ui
      WHERE ui.user_id = u.id AND ui.provider = 'github'
    ) AS has_github
  FROM users u
`;

export async function upsertExternalUser(
  db: D1Database,
  identity: ExternalIdentity,
): Promise<AuthUser> {
  const existingIdentity = await db
    .prepare(
      `${USER_SELECT}
       JOIN user_identities existing_identity
         ON existing_identity.user_id = u.id
       WHERE existing_identity.provider = ?
         AND existing_identity.provider_sub = ?`,
    )
    .bind(identity.provider, identity.providerSub)
    .first<UserRow>();

  if (existingIdentity) {
    await db
      .prepare(
        `UPDATE users
         SET display_name = ?,
             avatar_url = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .bind(identity.name, identity.avatarUrl, existingIdentity.id)
      .run();

    return {
      ...toAuthUser(existingIdentity),
      name: identity.name,
      avatarUrl: identity.avatarUrl,
    };
  }

  const user = await db
    .prepare(
      `INSERT INTO users (username, email, display_name, avatar_url)
       VALUES (NULL, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id, username, email, display_name, avatar_url`,
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

  const hydratedUser = await findUserById(db, user.id);
  if (!hydratedUser) throw new Error('Failed to load external user');
  return hydratedUser;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<AuthUser | null> {
  const row = await db
    .prepare(`${USER_SELECT} WHERE u.email = ? COLLATE NOCASE`)
    .bind(email)
    .first<UserRow>();
  return row ? toAuthUser(row) : null;
}

export async function findUserByUsername(
  db: D1Database,
  username: string,
): Promise<AuthUser | null> {
  const row = await db
    .prepare(`${USER_SELECT} WHERE u.username = ? COLLATE NOCASE`)
    .bind(username)
    .first<UserRow>();
  return row ? toAuthUser(row) : null;
}

export async function findUserById(db: D1Database, userId: number): Promise<AuthUser | null> {
  const row = await db.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(userId).first<UserRow>();
  return row ? toAuthUser(row) : null;
}

export async function createLocalUser(
  db: D1Database,
  input: {
    username: string;
    credential: {
      algorithm: string;
      iterations: number;
      salt: string;
      passwordHash: string;
    };
  },
): Promise<AuthUser | null> {
  let user: UserRow | null;
  try {
    user = await db
      .prepare(
        `INSERT INTO users (username, email, display_name, avatar_url)
         VALUES (?, NULL, ?, '')
         RETURNING id, username, email, display_name, avatar_url`,
      )
      .bind(input.username, input.username)
      .first<UserRow>();
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return null;
    throw error;
  }

  if (!user) throw new Error('Failed to create user');

  try {
    await setPasswordCredential(db, user.id, input.credential);
  } catch (error) {
    await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    throw error;
  }

  return toAuthUser({ ...user, has_password: 1, has_google: 0, has_github: 0 });
}

export type BindIdentityResult =
  | { status: 'bound'; user: AuthUser }
  | { status: 'identity_conflict' | 'email_conflict' | 'user_conflict' };

export async function bindExternalIdentity(
  db: D1Database,
  userId: number,
  identity: ExternalIdentity,
): Promise<BindIdentityResult> {
  const [identityOwner, emailOwner, currentUser] = await Promise.all([
    db
      .prepare(
        `SELECT user_id
         FROM user_identities
         WHERE provider = ? AND provider_sub = ?`,
      )
      .bind(identity.provider, identity.providerSub)
      .first<{ user_id: number }>(),
    db
      .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
      .bind(identity.email)
      .first<{ id: number }>(),
    findUserById(db, userId),
  ]);

  if (!currentUser) return { status: 'user_conflict' };
  if (identityOwner && identityOwner.user_id !== userId) return { status: 'identity_conflict' };
  if (emailOwner && emailOwner.id !== userId) return { status: 'email_conflict' };
  if (currentUser.email && currentUser.email.toLowerCase() !== identity.email.toLowerCase()) {
    return { status: 'email_conflict' };
  }

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE users
           SET email = ?,
               display_name = ?,
               avatar_url = CASE WHEN avatar_url = '' THEN ? ELSE avatar_url END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .bind(identity.email, identity.name, identity.avatarUrl, userId),
      db
        .prepare(
          `INSERT INTO user_identities (provider, provider_sub, user_id)
           VALUES (?, ?, ?)`,
        )
        .bind(identity.provider, identity.providerSub, userId),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return { status: 'identity_conflict' };
    }
    throw error;
  }

  const user = await findUserById(db, userId);
  if (!user) throw new Error('Failed to load bound user');
  return { status: 'bound', user };
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

export async function recordRegistrationAttempt(
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
  const blockedUntil = attempts > policy.maxAttempts ? now + policy.blockMs : 0;

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

export async function deleteOtherSessions(
  db: D1Database,
  userId: number,
  currentTokenHash: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
    .bind(userId, currentTokenHash)
    .run();
}
