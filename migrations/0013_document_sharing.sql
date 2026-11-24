-- 每篇文档最多一个可撤销的只读分享链接。
ALTER TABLE documents ADD COLUMN share_id TEXT;
ALTER TABLE documents ADD COLUMN shared_at TEXT;

CREATE UNIQUE INDEX idx_documents_share_id
  ON documents (share_id)
  WHERE share_id IS NOT NULL;
