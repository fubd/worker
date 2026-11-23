import { useState } from 'react';

export default function FolderDialog({
  mode,
  name,
  saving,
  deleting,
  onChange,
  onClose,
  onDelete,
  onSubmit,
}: {
  mode: 'create' | 'rename';
  name: string;
  saving: boolean;
  deleting: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onSubmit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const title = mode === 'create' ? '新建文件夹' : '管理文件夹';

  return (
    <div
      className="swan-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="swan-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swan-folder-dialog-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <header>
          <span>{mode === 'create' ? 'ORGANIZE' : 'FOLDER'}</span>
          <h2 id="swan-folder-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        {confirmingDelete ? (
          <div className="swan-folder-delete-confirm">
            <strong>删除“{name}”？</strong>
            <p>文件夹里的文档不会删除，只会移到“未归档”。</p>
            <div>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                取消
              </button>
              <button type="button" className="is-danger" disabled={deleting} onClick={onDelete}>
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor="swan-folder-name">名称</label>
            <input
              id="swan-folder-name"
              autoFocus
              maxLength={60}
              value={name}
              placeholder="例如：产品笔记"
              onChange={(event) => onChange(event.target.value)}
            />
            <p>最多 60 个字符，同一账号下名称不能重复。</p>
            <div className="swan-folder-dialog-actions">
              {mode === 'rename' && (
                <button
                  type="button"
                  className="is-danger-text"
                  onClick={() => setConfirmingDelete(true)}
                >
                  删除文件夹
                </button>
              )}
              <span />
              <button type="button" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="is-primary" disabled={saving || !name.trim()}>
                {saving ? '保存中…' : mode === 'create' ? '创建文件夹' : '保存名称'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
