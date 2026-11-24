import { useEffect, useState } from 'react';
import { App, Button, Modal } from 'antd';
import { Clock3, LoaderCircle, RotateCcw, Save } from 'lucide-react';

import type { PublicId } from '@/shared/ids';
import type { DocumentVersionRecord, DocumentVersionSummary } from '@/shared/types';
import { api, ApiError } from '../api/client';

interface DocumentHistoryModalProps {
  currentVersion: number;
  documentId: PublicId;
  open: boolean;
  onClose: () => void;
  onCreateCheckpoint: () => Promise<void>;
  onRestore: (version: number) => Promise<void>;
}

function formatVersionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function DocumentHistoryModal({
  currentVersion,
  documentId,
  open,
  onClose,
  onCreateCheckpoint,
  onRestore,
}: DocumentHistoryModalProps) {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<DocumentVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<DocumentVersionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    api
      .listDocumentVersions(documentId, { signal: controller.signal })
      .then(({ items: nextItems }) => {
        setItems(nextItems);
        setSelectedVersion(nextItems[0]?.version ?? null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        message.error(error instanceof Error ? error.message : '版本历史加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, message, open]);

  useEffect(() => {
    if (!open || selectedVersion === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    setPreviewLoading(true);
    api
      .getDocumentVersion(documentId, selectedVersion)
      .then((version) => {
        if (!controller.signal.aborted) setPreview(version);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          message.error(error instanceof Error ? error.message : '版本内容加载失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => controller.abort();
  }, [documentId, message, open, selectedVersion]);

  const reloadVersions = async () => {
    const { items: nextItems } = await api.listDocumentVersions(documentId);
    setItems(nextItems);
    setSelectedVersion(nextItems[0]?.version ?? null);
  };

  const saveCurrentVersion = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onCreateCheckpoint();
      await reloadVersions();
      message.success('当前版本已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存版本失败');
    } finally {
      setSaving(false);
    }
  };

  const restoreSelectedVersion = () => {
    if (selectedVersion === null || restoring) return;
    const target = items.find((item) => item.version === selectedVersion);
    modal.confirm({
      title: `恢复到第 ${selectedVersion} 版？`,
      okText: '恢复此版本',
      cancelText: '取消',
      onOk: async () => {
        setRestoring(true);
        try {
          await onRestore(selectedVersion);
          message.success(`已恢复到第 ${selectedVersion} 版`);
          onClose();
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            message.error('文档刚刚在其他页面更新，请关闭后重新加载');
          } else {
            message.error(error instanceof Error ? error.message : '恢复版本失败');
          }
        } finally {
          setRestoring(false);
        }
      },
      content: (
        <div>
          <p>当前内容会先保存为一个历史版本，恢复后仍可找回。</p>
          {target && <small>{target.title}</small>}
        </div>
      ),
    });
  };

  return (
    <Modal
      open={open}
      title="版本历史"
      width={820}
      centered
      footer={null}
      destroyOnHidden
      className="swan-history-modal"
      onCancel={onClose}
    >
      <div className="swan-history-toolbar">
        <span>当前为第 {currentVersion} 版，最多保留最近 30 个版本</span>
        <Button
          size="small"
          icon={<Save aria-hidden="true" size={14} strokeWidth={1.8} />}
          loading={saving}
          onClick={() => void saveCurrentVersion()}
        >
          保存当前版本
        </Button>
      </div>

      <div className="swan-history-layout">
        <div className="swan-history-list" aria-label="历史版本列表">
          {loading ? (
            <div className="swan-history-loading">
              <LoaderCircle className="swan-save-icon is-spinning" aria-hidden="true" size={18} />
              正在加载
            </div>
          ) : items.length === 0 ? (
            <div className="swan-history-empty">
              还没有历史版本。保存当前版本，或等待编辑后的自动检查点。
            </div>
          ) : (
            items.map((item) => (
              <button
                type="button"
                key={item.version}
                className={
                  selectedVersion === item.version
                    ? 'swan-history-item is-selected'
                    : 'swan-history-item'
                }
                onClick={() => setSelectedVersion(item.version)}
              >
                <span className="swan-history-item-head">
                  <strong>第 {item.version} 版</strong>
                  <time>{formatVersionTime(item.createdAt)}</time>
                </span>
                <span className="swan-history-item-title">{item.title}</span>
                <span className="swan-history-item-excerpt">{item.excerpt || '空白文档'}</span>
              </button>
            ))
          )}
        </div>

        <div className="swan-history-preview">
          {previewLoading ? (
            <div className="swan-history-loading">
              <LoaderCircle className="swan-save-icon is-spinning" aria-hidden="true" size={18} />
              正在加载
            </div>
          ) : preview ? (
            <>
              <div className="swan-history-preview-head">
                <div>
                  <strong>{preview.title}</strong>
                  <span>
                    <Clock3 aria-hidden="true" size={13} strokeWidth={1.8} />
                    {formatVersionTime(preview.createdAt)}
                  </span>
                </div>
                <Button
                  type="primary"
                  size="small"
                  icon={<RotateCcw aria-hidden="true" size={14} strokeWidth={1.8} />}
                  loading={restoring}
                  onClick={restoreSelectedVersion}
                >
                  恢复此版本
                </Button>
              </div>
              <div className="swan-history-preview-body">
                {preview.contentText.trim() || '空白文档'}
              </div>
            </>
          ) : (
            <div className="swan-history-empty">选择一个版本查看内容</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
