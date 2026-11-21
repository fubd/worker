-- 个人知识库的文档模型。content_json 保留编辑器结构，content_html 用于只读渲染，
-- content_text 为后续搜索和摘要提供纯文本。version 为自动保存与冲突处理预留。
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  content_json  TEXT    NOT NULL,
  content_html  TEXT    NOT NULL,
  content_text  TEXT    NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_updated_at_id
  ON documents (updated_at DESC, id DESC);
