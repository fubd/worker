-- 列表查询形态固定为：WHERE completed = ? ORDER BY completed ASC, id DESC
-- 复合索引可以同时覆盖过滤与排序，替代原来的两个单列索引
CREATE INDEX IF NOT EXISTS idx_todos_completed_id ON todos (completed, id DESC);

-- 单列索引已是复合索引的前缀，或没有任何查询用到，直接移除
DROP INDEX IF EXISTS idx_todos_completed;
DROP INDEX IF EXISTS idx_todos_created_at;
