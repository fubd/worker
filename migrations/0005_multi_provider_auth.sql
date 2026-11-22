-- 将单一 Google subject 拆成通用登录身份，支持同一所有者使用多个登录方式。
CREATE TABLE IF NOT EXISTS user_identities (
  provider     TEXT    NOT NULL,
  provider_sub TEXT    NOT NULL,
  user_id      INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id
  ON user_identities (user_id);

INSERT INTO user_identities (provider, provider_sub, user_id, created_at, updated_at)
SELECT 'google', google_sub, id, created_at, updated_at
FROM users
WHERE google_sub IS NOT NULL
ON CONFLICT (provider, provider_sub) DO NOTHING;

CREATE TABLE users_next (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT    NOT NULL,
  avatar_url   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_next (id, email, display_name, avatar_url, created_at, updated_at)
SELECT id, email, display_name, avatar_url, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;
