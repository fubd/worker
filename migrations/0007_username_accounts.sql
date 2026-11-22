-- 公开多用户注册：账号名和密码可以先创建账号，邮箱稍后通过可信 OAuth 绑定。
CREATE TABLE users_next (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    COLLATE NOCASE UNIQUE,
  email        TEXT    COLLATE NOCASE UNIQUE,
  display_name TEXT    NOT NULL,
  avatar_url   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (username IS NOT NULL OR email IS NOT NULL)
);

INSERT INTO users_next (
  id, username, email, display_name, avatar_url, created_at, updated_at
)
SELECT
  id, NULL, email, display_name, avatar_url, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;
