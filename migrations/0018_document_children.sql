-- 文档可直接作为父节点组织子文档；分组仍使用 folders 表。
ALTER TABLE documents ADD COLUMN parent_document_id INTEGER;

CREATE INDEX idx_documents_owner_parent_document_updated
  ON documents (owner_id, parent_document_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER documents_release_children_before_delete
AFTER DELETE ON documents
BEGIN
  UPDATE documents
  SET parent_document_id = NULL
  WHERE parent_document_id = OLD.id;
END;
