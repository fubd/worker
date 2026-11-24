-- M5：公开 Beta 的列表分页与配额查询索引。
CREATE INDEX IF NOT EXISTS idx_documents_owner_list
  ON documents (
    owner_id,
    deleted_at,
    is_pinned DESC,
    is_favorite DESC,
    last_viewed_at DESC,
    updated_at DESC,
    id DESC
  );
