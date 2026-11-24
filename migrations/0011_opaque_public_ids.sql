-- 公开 ID 不携带资源类型前缀。资源类型由 API 路径和字段语义表达，
-- 避免未来新增资源类型时维护一张 ID 前缀表。
-- 当前处于开发阶段，现有文档和文件夹统一重写为 24 位不透明 ID。

UPDATE documents
SET public_id = lower(hex(randomblob(12)));

UPDATE folders
SET public_id = lower(hex(randomblob(12)));
