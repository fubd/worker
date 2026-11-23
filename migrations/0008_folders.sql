-- M2：用单层文件夹整理文档。删除文件夹时文档回到“未归档”，不会删除文档。
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL,
  name       TEXT    COLLATE NOCASE NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_owner_name
  ON folders (owner_id, name);

ALTER TABLE documents ADD COLUMN folder_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_documents_owner_folder_active_updated
  ON documents (owner_id, folder_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
