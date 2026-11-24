-- 收藏是文档元数据，不参与正文版本号，也不影响最后编辑时间。
ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_owner_favorite_active_updated
  ON documents (owner_id, is_favorite, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
