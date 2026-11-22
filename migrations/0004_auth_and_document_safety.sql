-- M1：账号、服务端会话、文档归属、乐观并发与回收站。
-- 现有文档先保留 owner_id = NULL，由首个白名单账号首次登录时接管。
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub   TEXT    NOT NULL UNIQUE,
  email        TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT    NOT NULL,
  avatar_url   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

ALTER TABLE documents ADD COLUMN owner_id INTEGER;
ALTER TABLE documents ADD COLUMN deleted_at TEXT;

DROP INDEX IF EXISTS idx_documents_updated_at_id;

CREATE INDEX IF NOT EXISTS idx_documents_owner_active_updated
  ON documents (owner_id, deleted_at, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_documents_owner_trash_updated
  ON documents (owner_id, deleted_at DESC, updated_at DESC, id DESC);
