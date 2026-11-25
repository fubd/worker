export default function RenameFolderDialog({
  name,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  name: string;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
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
          <span>GROUP</span>
          <h2 id="swan-folder-dialog-title">重命名分组</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

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
            maxLength={30}
            value={name}
            placeholder="例如：产品笔记"
            onChange={(event) => onChange(event.target.value)}
          />
          <p>最多 30 个字符，同一目录下名称不能重复。</p>
          <div className="swan-folder-dialog-actions">
            <span />
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="is-primary" disabled={saving || !name.trim()}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
