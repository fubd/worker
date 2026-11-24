import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { Command } from 'cmdk';
import { FilePlus2, FileText, Folder, LoaderCircle, Search, Star, Trash2 } from 'lucide-react';

import type { PublicId } from '@/shared/ids';
import type { DocumentSummary, FolderSummary } from '@/shared/types';
import { api } from '../api/client';
import { OverflowText } from './OverflowText';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateDocument: () => void;
  onNavigate: (path: string) => void;
  onOpenDocument: (id: PublicId) => void;
}

function commandDocumentTarget(id: PublicId): string {
  return `/docs/${id}`;
}

export function CommandPalette({
  open,
  onClose,
  onCreateDocument,
  onNavigate,
  onOpenDocument,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const controller = new AbortController();
    api
      .listFolders({ signal: controller.signal })
      .then(({ items }) => setFolders(items))
      .catch(() => {
        if (!controller.signal.aborted) setFolders([]);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        api
          .listDocuments({ query, signal: controller.signal })
          .then(({ items }) => setDocuments(items))
          .catch(() => {
            if (!controller.signal.aborted) setDocuments([]);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query ? 180 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const matches = (...values: string[]) =>
    !normalizedQuery ||
    values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  const matchingFolders = folders.filter((folder) =>
    folder.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
  );
  const navigationItems = [
    { value: 'navigate-all', label: '全部文档', path: '/docs', icon: FileText },
    { value: 'navigate-favorites', label: '收藏', path: '/docs?view=favorites', icon: Star },
    { value: 'navigate-trash', label: '回收站', path: '/docs?view=trash', icon: Trash2 },
  ].filter((item) => matches(item.label));

  const navigate = (path: string) => {
    onNavigate(path);
    onClose();
  };

  const openDocument = (id: PublicId) => {
    onOpenDocument(id);
    onClose();
  };

  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      centered
      width={680}
      className="swan-command-modal"
      onCancel={onClose}
    >
      <Command label="快速打开" shouldFilter={false} loop>
        <div className="swan-command-search">
          <Search aria-hidden="true" size={17} strokeWidth={1.8} />
          <Command.Input
            autoFocus
            value={query}
            placeholder="搜索文档，或输入操作..."
            onValueChange={setQuery}
          />
          {loading ? (
            <LoaderCircle className="swan-save-icon is-spinning" aria-hidden="true" size={15} />
          ) : (
            <kbd>ESC</kbd>
          )}
        </div>

        <Command.List className="swan-command-list">
          <Command.Empty className="swan-command-empty">没有匹配的文档或操作</Command.Empty>

          {!normalizedQuery && (
            <Command.Group heading="操作">
              <Command.Item
                value="action-new-document"
                onSelect={() => {
                  onCreateDocument();
                  onClose();
                }}
              >
                <FilePlus2 aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>新建文档</span>
                <small>创建一篇空白文档</small>
              </Command.Item>
            </Command.Group>
          )}

          {navigationItems.length > 0 && (
            <Command.Group heading="前往">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.value}
                    value={item.value}
                    onSelect={() => navigate(item.path)}
                  >
                    <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {matchingFolders.length > 0 && (
            <Command.Group heading="文件夹">
              {matchingFolders.map((folder) => (
                <Command.Item
                  key={folder.id}
                  value={`folder-${folder.id}`}
                  onSelect={() => navigate(`/docs?folder=${folder.id}`)}
                >
                  <Folder aria-hidden="true" size={16} strokeWidth={1.8} />
                  <OverflowText text={folder.name} />
                  <small>{folder.documentCount} 篇</small>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading={normalizedQuery ? '搜索结果' : '最近文档'}>
            {documents.map((document) => (
              <Command.Item
                key={document.id}
                value={commandDocumentTarget(document.id)}
                onSelect={() => openDocument(document.id)}
              >
                <FileText aria-hidden="true" size={16} strokeWidth={1.8} />
                <span className="swan-command-document-copy">
                  <strong>{document.title}</strong>
                  <small>{document.excerpt || '空白文档'}</small>
                </span>
                {document.favorite && (
                  <Star
                    className="swan-command-favorite"
                    aria-label="已收藏"
                    size={12}
                    strokeWidth={1.8}
                    fill="currentColor"
                  />
                )}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        <div className="swan-command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            选择
          </span>
          <span>
            <kbd>↵</kbd>
            打开
          </span>
        </div>
      </Command>
    </Modal>
  );
}
