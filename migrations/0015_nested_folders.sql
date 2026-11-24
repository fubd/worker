-- M3：支持多层文件夹。名称只在同一父目录内唯一，文档和现有文件夹 ID 保持不变。

CREATE TABLE folders_next (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id  TEXT    NOT NULL,
  owner_id   INTEGER NOT NULL,
  parent_id  INTEGER,
  name       TEXT    COLLATE NOCASE NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO folders_next (id, public_id, owner_id, parent_id, name, created_at, updated_at)
SELECT id, public_id, owner_id, NULL, name, created_at, updated_at
FROM folders;

DROP TABLE folders;
ALTER TABLE folders_next RENAME TO folders;

CREATE UNIQUE INDEX idx_folders_public_id ON folders (public_id);
CREATE UNIQUE INDEX idx_folders_owner_parent_name
  ON folders (owner_id, COALESCE(parent_id, 0), name);
CREATE INDEX idx_folders_owner_parent
  ON folders (owner_id, parent_id, name);
