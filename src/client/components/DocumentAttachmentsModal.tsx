import { useEffect, useRef, useState } from 'react';
import { App, Button, Modal } from 'antd';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import type { PublicId } from '@/shared/ids';
import { apiPath } from '@/shared/api-config';
import type { DocumentAttachment } from '@/shared/types';
import { api, ApiError } from '../api/client';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 413) return '单个附件不能超过 10 MB';
  return error instanceof Error ? error.message : fallback;
}

export default function DocumentAttachmentsModal({
  documentId,
  onClose,
}: {
  documentId: PublicId;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<DocumentAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<PublicId | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .listAttachments(documentId, { signal: controller.signal })
      .then(({ items: next }) => setItems(next))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) message.error(errorMessage(error, '附件加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, message]);

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size === 0) {
      message.error('不能上传空文件');
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      message.error('单个附件不能超过 10 MB');
      return;
    }

    setUploading(true);
    try {
      const attachment = await api.uploadAttachment(documentId, file);
      setItems((current) => [attachment, ...current]);
      message.success('附件已上传');
    } catch (error) {
      message.error(errorMessage(error, '附件上传失败'));
    } finally {
      setUploading(false);
    }
  };

  const download = (attachment: DocumentAttachment) => {
    const anchor = document.createElement('a');
    anchor.href = apiPath(`/documents/${documentId}/attachments/${attachment.id}/download`);
    anchor.download = attachment.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const remove = (attachment: DocumentAttachment) => {
    if (deletingId) return;
    modal.confirm({
      title: '删除这个附件？',
      content: attachment.fileName,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(attachment.id);
        try {
          await api.deleteAttachment(documentId, attachment.id);
          setItems((current) => current.filter((item) => item.id !== attachment.id));
          message.success('附件已删除');
        } catch (error) {
          message.error(errorMessage(error, '附件删除失败'));
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  return (
    <Modal
      open
      title="文档附件"
      width={560}
      centered
      footer={null}
      destroyOnHidden
      onCancel={onClose}
    >
      <input
        ref={inputRef}
        hidden
        type="file"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="swan-attachment-upload"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <span>
          {uploading ? (
            <Upload className="is-spinning" aria-hidden="true" size={19} strokeWidth={1.8} />
          ) : (
            <Paperclip aria-hidden="true" size={19} strokeWidth={1.8} />
          )}
        </span>
        <span>
          <strong>{uploading ? '正在上传…' : '添加附件'}</strong>
          <small>单个文件最大 10 MB，文件会安全保存在当前文档下</small>
        </span>
      </button>

      <div className="swan-attachment-list" aria-busy={loading || undefined}>
        {loading ? (
          <div className="swan-attachment-empty">正在加载附件…</div>
        ) : items.length === 0 ? (
          <div className="swan-attachment-empty">
            <FileText aria-hidden="true" size={20} strokeWidth={1.7} />
            <span>还没有附件</span>
          </div>
        ) : (
          items.map((attachment) => (
            <div className="swan-attachment-row" key={attachment.id}>
              <span className="swan-attachment-file-icon">
                <FileText aria-hidden="true" size={17} strokeWidth={1.7} />
              </span>
              <span className="swan-attachment-copy">
                <strong title={attachment.fileName}>{attachment.fileName}</strong>
                <small>{formatSize(attachment.size)}</small>
              </span>
              <Button
                type="text"
                size="small"
                icon={<Download aria-hidden="true" size={15} strokeWidth={1.8} />}
                aria-label={`下载 ${attachment.fileName}`}
                onClick={() => download(attachment)}
              />
              <Button
                danger
                type="text"
                size="small"
                loading={deletingId === attachment.id}
                icon={<Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />}
                aria-label={`删除 ${attachment.fileName}`}
                onClick={() => remove(attachment)}
              />
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
