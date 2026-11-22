-- 密码是绑定到现有用户的凭据，不创建第二套账号。
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id     INTEGER PRIMARY KEY,
  algorithm   TEXT    NOT NULL,
  iterations  INTEGER NOT NULL,
  salt        TEXT    NOT NULL,
  password_hash TEXT  NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key               TEXT    PRIMARY KEY,
  attempts          INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until
  ON auth_rate_limits (blocked_until);
