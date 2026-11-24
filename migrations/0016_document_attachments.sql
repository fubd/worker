-- M4：文档附件元数据。文件本体存放在 R2，D1 只保存可查询的归属信息。

CREATE TABLE document_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id   TEXT    NOT NULL,
  owner_id    INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  object_key  TEXT    NOT NULL,
  file_name   TEXT    NOT NULL,
  content_type TEXT   NOT NULL,
  size        INTEGER NOT NULL CHECK (size > 0),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_document_attachments_public_id
  ON document_attachments (public_id);
CREATE UNIQUE INDEX idx_document_attachments_object_key
  ON document_attachments (object_key);
CREATE INDEX idx_document_attachments_owner_document
  ON document_attachments (owner_id, document_id, created_at DESC, id DESC);
