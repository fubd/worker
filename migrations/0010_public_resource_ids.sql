-- 对外资源 ID 与数据库主键分离：内部仍使用整数主键，API 和 URL 使用随机公开 ID。
-- 当前处于开发阶段，迁移时统一为现有文件夹和文档生成新 ID。

CREATE TABLE folders_next (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id  TEXT    NOT NULL,
  owner_id   INTEGER NOT NULL,
  name       TEXT    COLLATE NOCASE NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, name)
);

INSERT INTO folders_next (id, public_id, owner_id, name, created_at, updated_at)
SELECT
  id,
  'f_' || lower(hex(randomblob(12))),
  owner_id,
  name,
  created_at,
  updated_at
FROM folders;

DROP TABLE folders;
ALTER TABLE folders_next RENAME TO folders;

CREATE UNIQUE INDEX idx_folders_public_id ON folders (public_id);
CREATE INDEX idx_folders_owner_name ON folders (owner_id, name);

CREATE TABLE documents_next (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id     TEXT    NOT NULL,
  owner_id      INTEGER,
  folder_id     INTEGER,
  title         TEXT    NOT NULL,
  content_json  TEXT    NOT NULL,
  content_html  TEXT    NOT NULL,
  content_text  TEXT    NOT NULL DEFAULT '',
  is_favorite   INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

INSERT INTO documents_next (
  id,
  public_id,
  owner_id,
  folder_id,
  title,
  content_json,
  content_html,
  content_text,
  is_favorite,
  version,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  'd_' || lower(hex(randomblob(12))),
  owner_id,
  folder_id,
  title,
  content_json,
  content_html,
  content_text,
  is_favorite,
  version,
  created_at,
  updated_at,
  deleted_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_next RENAME TO documents;

CREATE UNIQUE INDEX idx_documents_public_id ON documents (public_id);
CREATE INDEX idx_documents_owner_active_updated
  ON documents (owner_id, deleted_at, updated_at DESC, id DESC);
CREATE INDEX idx_documents_owner_trash_updated
  ON documents (owner_id, deleted_at DESC, updated_at DESC, id DESC);
CREATE INDEX idx_documents_owner_folder_active_updated
  ON documents (owner_id, folder_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_owner_favorite_active_updated
  ON documents (owner_id, is_favorite, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
