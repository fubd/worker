import { useRef, useState } from 'react';
import { Alert, Button, Modal } from 'antd';
import { FileText, Inbox, LoaderCircle } from 'lucide-react';
import type { DocumentImportInput } from '@/shared/types';

const MAX_IMPORT_BYTES = 1_000_000;
const SUPPORTED_EXTENSIONS = new Set(['md', 'markdown', 'html', 'htm', 'json', 'txt']);

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export default function ImportDocumentModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (input: DocumentImportInput) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (importing) return;
    setFile(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!file || importing) return;
    setImporting(true);
    setError(null);
    try {
      const { parseImportFile } = await import(
        /* webpackChunkName: "document-import-parser" */ '../document-import'
      );
      const input = await parseImportFile(file);
      await onImport(input);
      setFile(null);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败，请检查文件内容');
    } finally {
      setImporting(false);
    }
  };

  const selectFile = (selected: File | undefined) => {
    setError(null);
    if (!selected) return;
    if (!SUPPORTED_EXTENSIONS.has(fileExtension(selected.name))) {
      setFile(null);
      setError('仅支持 Markdown、HTML、JSON 和纯文本文件');
      return;
    }
    if (selected.size > MAX_IMPORT_BYTES) {
      setFile(null);
      setError('文件不能超过 1 MB');
      return;
    }
    setFile(selected);
  };

  return (
    <Modal
      open={open}
      title="导入文档"
      width={520}
      centered
      destroyOnHidden
      onCancel={close}
      footer={[
        <Button key="cancel" disabled={importing} onClick={close}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          disabled={!file}
          loading={importing}
          icon={importing ? undefined : <FileText aria-hidden="true" size={15} />}
          onClick={() => void submit()}
        >
          导入并打开
        </Button>,
      ]}
    >
      <div
        className={dragging ? 'swan-import-dropzone is-dragging' : 'swan-import-dropzone'}
        role="button"
        tabIndex={0}
        aria-disabled={importing}
        onClick={() => {
          if (!importing) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!importing && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!importing) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!importing) selectFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".md,.markdown,.html,.htm,.json,.txt"
          disabled={importing}
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <p className="swan-import-icon">
          {importing ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" size={24} />
          ) : (
            <Inbox aria-hidden="true" size={24} strokeWidth={1.7} />
          )}
        </p>
        <p className="swan-import-title">{file ? file.name : '拖入文件，或点击选择'}</p>
        <p className="swan-import-help">
          {file
            ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · 点击可重新选择`
            : '支持 .md、.html、.json、.txt，最大 1 MB'}
        </p>
      </div>
      {error && (
        <Alert
          className="swan-import-error"
          type="error"
          showIcon
          title={error}
          closable
          onClose={() => setError(null)}
        />
      )}
    </Modal>
  );
}
