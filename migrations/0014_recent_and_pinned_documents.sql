-- 最近浏览与置顶使用文档元数据，不复制正文。
ALTER TABLE documents ADD COLUMN last_viewed_at TEXT;
ALTER TABLE documents ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_documents_owner_pinned_viewed
  ON documents (owner_id, deleted_at, is_pinned DESC, last_viewed_at DESC, updated_at DESC);
