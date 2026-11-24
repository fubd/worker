-- 文档检查点。自动保存会节流生成历史，手动保存版本和恢复操作不受节流限制。
CREATE TABLE document_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL,
  owner_id      INTEGER NOT NULL,
  version       INTEGER NOT NULL,
  title         TEXT    NOT NULL,
  content_json  TEXT    NOT NULL,
  content_html  TEXT    NOT NULL,
  content_text  TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (document_id, version)
);

CREATE INDEX idx_document_versions_owner_document_created
  ON document_versions (owner_id, document_id, version DESC);
