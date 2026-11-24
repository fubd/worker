import { useEffect, useState, type DragEvent as ReactDragEvent } from 'react';
import { Avatar, Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import {
  ChevronDown,
  Clock3,
  FileUp,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Link2,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router';

import { BRAND } from '@/shared/brand';
import { isPublicId, type PublicId } from '@/shared/ids';
import type { AuthUser, DocumentSummary, FolderSummary } from '@/shared/types';
import { BrandMark } from './BrandMark';
import {
  buildFolderTree,
  getFolderAncestors,
  getFolderPathLabel,
  isFolderInSubtree,
} from '../folder-utils';
import { OverflowText } from './OverflowText';
import { FolderCreateForm, FolderTreeItem, UnfiledDropRow } from './SidebarFolderTree';
import { beginSidebarDrag, readSidebarDrag, type SidebarDragPayload } from '../sidebar-drag';
import {
  formatUpdatedAt,
  type DocumentView,
  type FolderScope,
  type SaveState,
} from '../workspace-utils';

interface WorkspaceSidebarProps {
  activeId: PublicId | null;
  batchBusy: boolean;
  creating: boolean;
  creatingFolder: boolean;
  creatingFolderParentId: PublicId | null;
  deletingDocumentId: PublicId | null;
  documents: DocumentSummary[];
  folderDraft: string;
  folderScope: FolderScope;
  folderSaving: boolean;
  folders: FolderSummary[];
  isOpen: boolean;
  listLoading: boolean;
  restoringId: PublicId | null;
  saveState: SaveState;
  searchValue: string;
  selectionMode: boolean;
  selectedDocumentIds: ReadonlySet<PublicId>;
  user: AuthUser;
  view: DocumentView;
  onBindProvider: (provider: 'google' | 'github') => void;
  onBatchDelete: (ids: PublicId[]) => void;
  onBatchExport: (ids: PublicId[]) => void;
  onBatchFavorite: (ids: PublicId[], favorite: boolean) => void;
  onBatchMove: (ids: PublicId[], folderId: PublicId | null) => void;
  onCancelFolderCreate: () => void;
  onClearSelection: () => void;
  onCreate: () => void;
  onCreateFolder: (parentId: PublicId | null) => void;
  onDeleteDocument: (document: DocumentSummary) => void;
  onEditFolder: (folder: FolderSummary) => void;
  onFolderDraftChange: (value: string) => void;
  onFolderSelect: (scope: FolderScope) => void;
  onImport: () => void;
  onMoveDocument: (document: DocumentSummary, folderId: PublicId | null) => void;
  onMoveFolder: (folder: FolderSummary, parentId: PublicId | null) => void;
  onNavigate: () => void;
  onOpenPasswordSettings: () => void;
  onRestore: (document: DocumentSummary) => void;
  onSearchChange: (value: string) => void;
  onSelect: (id: PublicId) => void;
  onSignOut: () => void;
  onSubmitFolderCreate: () => void;
  onToggleFavorite: (document: DocumentSummary) => void;
  onTogglePinned: (document: DocumentSummary) => void;
  onToggleDocumentSelection: (id: PublicId) => void;
  onToggleSelectAll: (selected: boolean) => void;
  onToggleSelectionMode: () => void;
}

function DocumentListSkeleton() {
  return (
    <div className="swan-sidebar-document-skeleton swan-loading-surface" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div className="swan-skeleton-document" key={item}>
          <div className="swan-skeleton-bar is-document-title" />
          <div className="swan-skeleton-bar is-document-copy" />
        </div>
      ))}
    </div>
  );
}

function DocumentDragHandle({
  document,
  dragging,
  onBeginDrag,
  onDragEnd,
}: {
  document: DocumentSummary;
  dragging: boolean;
  onBeginDrag: (event: ReactDragEvent<HTMLElement>, payload: SidebarDragPayload) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className={dragging ? 'swan-document-drag is-dragging' : 'swan-document-drag'}
      aria-label={`拖动文档 ${document.title}`}
      draggable
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) =>
        onBeginDrag(event, { kind: 'document', id: document.id, label: document.title })
      }
      onDragEnd={onDragEnd}
    >
      <GripVertical aria-hidden="true" size={14} strokeWidth={1.8} />
    </button>
  );
}

export function WorkspaceSidebar({
  activeId,
  batchBusy,
  creating,
  creatingFolder,
  creatingFolderParentId,
  deletingDocumentId,
  documents,
  folderDraft,
  folderScope,
  folderSaving,
  folders,
  isOpen,
  listLoading,
  restoringId,
  saveState,
  searchValue,
  selectionMode,
  selectedDocumentIds,
  user,
  view,
  onBindProvider,
  onBatchDelete,
  onBatchExport,
  onBatchFavorite,
  onBatchMove,
  onCancelFolderCreate,
  onClearSelection,
  onCreate,
  onCreateFolder,
  onDeleteDocument,
  onEditFolder,
  onFolderDraftChange,
  onFolderSelect,
  onImport,
  onMoveDocument,
  onMoveFolder,
  onNavigate,
  onOpenPasswordSettings,
  onRestore,
  onSearchChange,
  onSelect,
  onSignOut,
  onSubmitFolderCreate,
  onToggleFavorite,
  onTogglePinned,
  onToggleDocumentSelection,
  onToggleSelectAll,
  onToggleSelectionMode,
}: WorkspaceSidebarProps) {
  'use no memo';

  const linkedProviders = user.linkedProviders;
  const folderTree = buildFolderTree(folders);
  const [draggingItem, setDraggingItem] = useState<SidebarDragPayload | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<PublicId>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const value = JSON.parse(
        window.localStorage.getItem('swan:expanded-folders') ?? '[]',
      ) as unknown;
      return new Set(Array.isArray(value) ? value.filter(isPublicId) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    window.localStorage.setItem('swan:expanded-folders', JSON.stringify([...expandedFolderIds]));
  }, [expandedFolderIds]);

  useEffect(() => {
    if (!isPublicId(folderScope)) return;
    const ancestorIds = getFolderAncestors(folders, folderScope).map((folder) => folder.id);
    setExpandedFolderIds((current) => {
      if (ancestorIds.every((id) => current.has(id))) return current;
      return new Set([...current, ...ancestorIds]);
    });
  }, [folderScope, folders]);

  useEffect(() => {
    if (!creatingFolder || !isPublicId(creatingFolderParentId)) return;
    const parentId = creatingFolderParentId;
    const ancestorIds = [
      ...getFolderAncestors(folders, parentId).map((folder) => folder.id),
      parentId,
    ];
    setExpandedFolderIds((current) => {
      if (ancestorIds.every((id) => current.has(id))) return current;
      return new Set([...current, ...ancestorIds]);
    });
  }, [creatingFolder, creatingFolderParentId, folders]);

  const toggleFolderExpanded = (folderId: PublicId) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const beginDrag = (event: ReactDragEvent<HTMLElement>, payload: SidebarDragPayload) => {
    setDraggingItem(payload);
    beginSidebarDrag(event, payload);
  };

  const resetDrag = () => {
    setDraggingItem(null);
    setDropTargetId(null);
  };

  const finishDrop = (event: ReactDragEvent<HTMLElement>, parentId: PublicId | null) => {
    const drag = readSidebarDrag(event) ?? draggingItem;
    resetDrag();
    if (!drag) return;

    if (drag.kind === 'document') {
      const document = documents.find((item) => item.id === drag.id);
      if (document && document.folderId !== parentId) onMoveDocument(document, parentId);
      return;
    }

    const folder = folders.find((item) => item.id === drag.id);
    if (
      !folder ||
      folder.parentId === parentId ||
      (parentId !== null &&
        (parentId === folder.id || isFolderInSubtree(folders, parentId, folder.id)))
    ) {
      return;
    }
    onMoveFolder(folder, parentId);
  };

  const handleDragOverTarget = (targetId: string) => {
    if (dropTargetId !== targetId) setDropTargetId(targetId);
  };

  const handleDragLeaveTarget = (targetId: string) => {
    setDropTargetId((current) => (current === targetId ? null : current));
  };

  const hasSearch = searchValue.trim().length > 0;
  const sectionTitle =
    view === 'trash'
      ? '已删除'
      : view === 'favorites'
        ? '收藏'
        : view === 'recent'
          ? '最近浏览'
          : hasSearch
            ? '搜索结果'
            : folderScope === 'all'
              ? '最近编辑'
              : folderScope === 'unfiled'
                ? '未归档'
                : (folders.find((folder) => folder.id === folderScope)?.name ?? '文件夹');
  const currentFolder = isPublicId(folderScope)
    ? folders.find((folder) => folder.id === folderScope)
    : undefined;
  const directChildFolderCount = currentFolder
    ? folders.filter((folder) => folder.parentId === currentFolder.id).length
    : 0;
  const sectionSummary =
    view === 'documents' && currentFolder && !hasSearch
      ? `${directChildFolderCount} 个子文件夹 · ${documents.length} 篇直属文档`
      : null;
  const selectedDocuments = documents.filter((document) => selectedDocumentIds.has(document.id));
  const selectedIds = selectedDocuments.map((document) => document.id);
  const selectedCount = selectedDocuments.length;
  const allSelected = documents.length > 0 && selectedCount === documents.length;
  const allSelectedFavorite =
    selectedCount > 0 && selectedDocuments.every((document) => document.favorite);
  const someSelectedFavorite = selectedDocuments.some((document) => document.favorite);

  const batchMoveItems: MenuProps['items'] = [
    {
      key: 'move:none',
      label: '未归档',
      icon: <FileText aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    ...folders.map((folder) => ({
      key: `move:${folder.id}`,
      label: getFolderPathLabel(folders, folder.id),
      icon: <Folder aria-hidden="true" size={15} strokeWidth={1.8} />,
    })),
  ];

  const getFolderMoveTargets = (folder: FolderSummary) => [
    ...(folder.parentId === null ? [] : [{ key: 'move:none', label: '顶层' }]),
    ...folders
      .filter(
        (target) =>
          target.id !== folder.id &&
          target.id !== folder.parentId &&
          !isFolderInSubtree(folders, target.id, folder.id),
      )
      .map((target) => ({
        key: `move:${target.id}`,
        label: getFolderPathLabel(folders, target.id),
      })),
  ];

  const getFolderMenuItems = (folder: FolderSummary): MenuProps['items'] => {
    const moveTargets = getFolderMoveTargets(folder);

    return [
      {
        key: 'create-child',
        label: '新建子文件夹',
        icon: <FolderPlus aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
      ...(moveTargets.length
        ? [
            {
              key: 'move',
              label: '移动到文件夹',
              icon: <Folder aria-hidden="true" size={15} strokeWidth={1.8} />,
              children: moveTargets,
            },
          ]
        : []),
      { type: 'divider' as const },
      {
        key: 'manage',
        label: '重命名或删除',
      },
    ];
  };

  const handleFolderMenuAction = (folder: FolderSummary, key: string) => {
    if (key === 'create-child') {
      onCreateFolder(folder.id);
      return;
    }
    if (key === 'manage') {
      onEditFolder(folder);
      return;
    }
    if (!key.startsWith('move:')) return;

    const target = key.slice('move:'.length);
    if (target === 'none') {
      onMoveFolder(folder, null);
    } else if (isPublicId(target)) {
      onMoveFolder(folder, target);
    }
  };

  const getDocumentMenuItems = (document: DocumentSummary): MenuProps['items'] => {
    const moveTargets = [
      ...(document.folderId === null ? [] : [{ key: 'move:none', label: '未归档' }]),
      ...folders
        .filter((folder) => folder.id !== document.folderId)
        .map((folder) => ({
          key: `move:${folder.id}`,
          label: getFolderPathLabel(folders, folder.id),
        })),
    ];

    return [
      {
        key: 'pin',
        label: document.pinned ? '取消置顶' : '置顶文档',
        icon: (
          <Pin
            aria-hidden="true"
            size={15}
            strokeWidth={1.8}
            fill={document.pinned ? 'currentColor' : 'none'}
          />
        ),
      },
      {
        key: 'favorite',
        label: document.favorite ? '取消收藏' : '收藏',
        icon: <Star aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
      ...(moveTargets.length
        ? [
            {
              key: 'move',
              label: '移动到文件夹',
              icon: <Folder aria-hidden="true" size={15} strokeWidth={1.8} />,
              children: moveTargets,
            },
          ]
        : []),
      ...(moveTargets.length ? [{ type: 'divider' as const }] : []),
      {
        key: 'delete',
        label: '移入回收站',
        danger: true,
        icon: <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
    ];
  };

  return (
    <aside className={isOpen ? 'swan-sidebar is-open' : 'swan-sidebar'}>
      <div className="swan-sidebar-brand">
        <span className="swan-sidebar-brand-mark">
          <BrandMark size={34} />
        </span>
        <span className="swan-sidebar-brand-copy">
          <strong>{BRAND.name}</strong>
          <small>{BRAND.tagline}</small>
        </span>
      </div>

      <div className="swan-sidebar-search">
        <Search aria-hidden="true" size={15} strokeWidth={1.8} />
        <input
          type="search"
          value={searchValue}
          aria-label="搜索文档"
          placeholder="搜索标题和正文"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onSearchChange('');
              event.currentTarget.blur();
            }
          }}
        />
        {hasSearch ? (
          <button type="button" aria-label="清除搜索" onClick={() => onSearchChange('')}>
            <X aria-hidden="true" size={13} strokeWidth={1.8} />
          </button>
        ) : (
          <kbd>⌘K</kbd>
        )}
      </div>

      <nav className="swan-sidebar-nav" aria-label="站点导航">
        <Link
          className={view === 'documents' && folderScope === 'all' ? 'is-selected' : undefined}
          to="/docs"
          onClick={onNavigate}
        >
          <FileText aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>全部文档</span>
        </Link>
        <Link
          className={view === 'recent' ? 'is-selected' : undefined}
          to="/docs?view=recent"
          onClick={onNavigate}
        >
          <Clock3 aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>最近浏览</span>
        </Link>
        <Link
          className={view === 'favorites' ? 'is-selected' : undefined}
          to="/docs?view=favorites"
          onClick={onNavigate}
        >
          <Star aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>收藏</span>
        </Link>
        <Link
          className={view === 'trash' ? 'is-selected' : undefined}
          to="/docs?view=trash"
          onClick={onNavigate}
        >
          <Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>回收站</span>
        </Link>
      </nav>

      {view === 'documents' && (
        <div className="swan-sidebar-folders">
          <div
            className={
              dropTargetId === 'folder-root'
                ? 'swan-sidebar-section-head is-drop-target'
                : 'swan-sidebar-section-head'
            }
            onDragOver={(event) => {
              if (!draggingItem) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              handleDragOverTarget('folder-root');
            }}
            onDragLeave={(event) => {
              event.stopPropagation();
              handleDragLeaveTarget('folder-root');
            }}
            onDrop={(event) => {
              event.preventDefault();
              finishDrop(event, null);
            }}
          >
            <span>文件夹</span>
            <Tooltip title="新建文件夹" placement="top">
              <button
                type="button"
                className="swan-sidebar-add"
                aria-label="新建文件夹"
                aria-expanded={creatingFolder}
                onClick={() => onCreateFolder(null)}
              >
                <FolderPlus aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
            </Tooltip>
          </div>

          {creatingFolder && creatingFolderParentId === null && (
            <FolderCreateForm
              draft={folderDraft}
              saving={folderSaving}
              onCancel={onCancelFolderCreate}
              onChange={onFolderDraftChange}
              onSubmit={onSubmitFolderCreate}
            />
          )}

          <UnfiledDropRow
            draggingItem={draggingItem}
            dropTargetId={dropTargetId}
            selected={folderScope === 'unfiled'}
            onDragLeaveTarget={handleDragLeaveTarget}
            onDragOverTarget={handleDragOverTarget}
            onDropTarget={finishDrop}
            onSelect={() => onFolderSelect('unfiled')}
          />

          {folderTree.map((node) => (
            <FolderTreeItem
              key={node.folder.id}
              activeFolderId={isPublicId(folderScope) ? folderScope : null}
              creatingFolder={creatingFolder}
              creatingFolderParentId={creatingFolderParentId}
              draggingItem={draggingItem}
              dropTargetId={dropTargetId}
              expandedFolderIds={expandedFolderIds}
              folders={folders}
              folderDraft={folderDraft}
              folderSaving={folderSaving}
              getFolderMenuItems={getFolderMenuItems}
              node={node}
              onBeginDrag={beginDrag}
              onCancelFolderCreate={onCancelFolderCreate}
              onDragEnd={resetDrag}
              onDragLeaveTarget={handleDragLeaveTarget}
              onDragOverTarget={handleDragOverTarget}
              onDropTarget={finishDrop}
              onEditFolder={onEditFolder}
              onFolderMenuAction={handleFolderMenuAction}
              onFolderDraftChange={onFolderDraftChange}
              onFolderSelect={onFolderSelect}
              onSubmitFolderCreate={onSubmitFolderCreate}
              onToggleExpanded={toggleFolderExpanded}
            />
          ))}
        </div>
      )}

      <div className="swan-sidebar-section-head">
        {selectionMode ? (
          <span className="swan-sidebar-section-copy swan-sidebar-selection-copy">
            <button
              type="button"
              className="swan-sidebar-select-all"
              aria-pressed={allSelected}
              disabled={batchBusy || documents.length === 0}
              onClick={() => onToggleSelectAll(!allSelected)}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
            <small>
              已选 {selectedCount} 篇，共 {documents.length} 篇
            </small>
          </span>
        ) : (
          <span className="swan-sidebar-section-copy">
            <OverflowText text={sectionTitle} className="swan-sidebar-section-title" />
            {sectionSummary && <small>{sectionSummary}</small>}
          </span>
        )}
        <span className="swan-sidebar-section-actions">
          {selectionMode ? (
            <Tooltip title="退出批量选择">
              <button
                type="button"
                className="swan-sidebar-add"
                aria-label="退出批量选择"
                disabled={batchBusy}
                onClick={onClearSelection}
              >
                <X aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
            </Tooltip>
          ) : (
            <>
              {!sectionSummary && (
                <span className="swan-sidebar-count">
                  {String(documents.length).padStart(2, '0')}
                </span>
              )}
              {view === 'documents' && (
                <>
                  <Tooltip title="导入文档" placement="top">
                    <button
                      type="button"
                      className="swan-sidebar-add"
                      aria-label="导入文档"
                      disabled={creating || saveState === 'conflict'}
                      onClick={onImport}
                    >
                      <FileUp aria-hidden="true" size={15} strokeWidth={1.8} />
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className="swan-sidebar-add"
                    aria-label="新建文档"
                    disabled={creating || saveState === 'conflict'}
                    onClick={onCreate}
                  >
                    <Plus aria-hidden="true" size={15} strokeWidth={1.8} />
                  </button>
                </>
              )}
              {view !== 'trash' && documents.length > 0 && (
                <Tooltip title="批量选择">
                  <button
                    type="button"
                    className="swan-sidebar-select-entry"
                    aria-label="批量选择"
                    disabled={listLoading}
                    onClick={onToggleSelectionMode}
                  >
                    选择
                  </button>
                </Tooltip>
              )}
            </>
          )}
        </span>
      </div>

      {selectionMode && (
        <div
          className="swan-sidebar-batch-actions"
          aria-label="批量文档操作"
          aria-busy={batchBusy || undefined}
        >
          <Dropdown
            trigger={['click']}
            placement="bottomLeft"
            disabled={batchBusy || selectedCount === 0}
            menu={{
              items: batchMoveItems,
              onClick: ({ key }) => {
                const target = key.slice('move:'.length);
                onBatchMove(
                  selectedIds,
                  target === 'none' ? null : isPublicId(target) ? target : null,
                );
              },
            }}
          >
            <Button
              className="swan-sidebar-batch-button"
              type="text"
              size="small"
              icon={<Folder aria-hidden="true" size={15} strokeWidth={1.8} />}
              aria-label="批量移动到文件夹"
              disabled={batchBusy || selectedCount === 0}
            />
          </Dropdown>
          <Dropdown
            trigger={['click']}
            placement="bottomLeft"
            disabled={batchBusy || selectedCount === 0}
            menu={{
              items: [
                {
                  key: 'favorite',
                  label: '收藏',
                  icon: <Star aria-hidden="true" size={15} strokeWidth={1.8} />,
                  disabled: allSelectedFavorite,
                },
                {
                  key: 'unfavorite',
                  label: '取消收藏',
                  icon: <Star aria-hidden="true" size={15} strokeWidth={1.8} fill="currentColor" />,
                  disabled: !someSelectedFavorite,
                },
              ],
              onClick: ({ key }) => onBatchFavorite(selectedIds, key === 'favorite'),
            }}
          >
            <Button
              className="swan-sidebar-batch-button"
              type="text"
              size="small"
              icon={
                <Star
                  aria-hidden="true"
                  size={15}
                  strokeWidth={1.8}
                  fill={allSelectedFavorite ? 'currentColor' : 'none'}
                />
              }
              aria-label="批量收藏操作"
              disabled={batchBusy || selectedCount === 0}
            />
          </Dropdown>
          <Button
            className="swan-sidebar-batch-button"
            type="text"
            size="small"
            icon={<FileText aria-hidden="true" size={15} strokeWidth={1.8} />}
            aria-label="导出所选文档"
            disabled={batchBusy || selectedCount === 0}
            onClick={() => onBatchExport(selectedIds)}
          />
          <Button
            className="swan-sidebar-batch-button is-danger"
            type="text"
            size="small"
            danger
            icon={<Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />}
            aria-label="批量移入回收站"
            disabled={batchBusy || selectedCount === 0}
            onClick={() => onBatchDelete(selectedIds)}
          />
          <span className="swan-sidebar-batch-status" aria-live="polite">
            {batchBusy ? '处理中…' : `${selectedCount} 项`}
          </span>
        </div>
      )}

      <div className="swan-sidebar-doc-list">
        {listLoading ? (
          <DocumentListSkeleton />
        ) : documents.length === 0 ? (
          <div className="swan-sidebar-empty">
            {view === 'trash'
              ? '回收站是空的'
              : view === 'favorites'
                ? hasSearch
                  ? '收藏中没有匹配的文档'
                  : '还没有收藏文档'
                : view === 'recent'
                  ? hasSearch
                    ? '最近浏览中没有匹配的文档'
                    : '还没有浏览记录'
                  : hasSearch
                    ? '没有匹配的文档'
                    : '这里还没有文档'}
          </div>
        ) : (
          documents.map((document) =>
            view === 'trash' ? (
              <div className="swan-sidebar-doc is-trash" key={document.id}>
                <OverflowText text={document.title} className="swan-sidebar-doc-title" />
                <span className="swan-sidebar-doc-excerpt">{document.excerpt || '空白文档'}</span>
                <span className="swan-sidebar-doc-time">
                  删除于 {formatUpdatedAt(document.deletedAt ?? document.updatedAt)}
                </span>
                <Button
                  size="small"
                  icon={<RotateCcw aria-hidden="true" size={13} strokeWidth={1.8} />}
                  loading={restoringId === document.id}
                  onClick={() => onRestore(document)}
                >
                  恢复
                </Button>
              </div>
            ) : (
              <div
                className={
                  selectionMode ? 'swan-sidebar-doc-item is-selecting' : 'swan-sidebar-doc-item'
                }
                key={document.id}
              >
                {selectionMode ? (
                  <input
                    className="swan-sidebar-doc-checkbox"
                    checked={selectedDocumentIds.has(document.id)}
                    aria-label={`选择文档 ${document.title}`}
                    disabled={batchBusy}
                    type="checkbox"
                    onChange={() => onToggleDocumentSelection(document.id)}
                  />
                ) : (
                  <DocumentDragHandle
                    document={document}
                    dragging={draggingItem?.kind === 'document' && draggingItem.id === document.id}
                    onBeginDrag={beginDrag}
                    onDragEnd={resetDrag}
                  />
                )}
                <button
                  type="button"
                  className={
                    selectionMode
                      ? selectedDocumentIds.has(document.id)
                        ? 'swan-sidebar-doc is-checked'
                        : 'swan-sidebar-doc'
                      : document.id === activeId
                        ? 'swan-sidebar-doc is-selected'
                        : 'swan-sidebar-doc'
                  }
                  aria-pressed={selectionMode ? selectedDocumentIds.has(document.id) : undefined}
                  disabled={
                    batchBusy ||
                    (!selectionMode && saveState === 'saving') ||
                    deletingDocumentId === document.id
                  }
                  onClick={() =>
                    selectionMode ? onToggleDocumentSelection(document.id) : onSelect(document.id)
                  }
                >
                  <span className="swan-sidebar-doc-title-row">
                    {document.favorite && (
                      <Star
                        className="swan-sidebar-doc-favorite"
                        aria-label="已收藏"
                        size={12}
                        strokeWidth={1.8}
                        fill="currentColor"
                      />
                    )}
                    {document.pinned && (
                      <Pin
                        className="swan-sidebar-doc-pinned"
                        aria-label="已置顶"
                        size={11}
                        strokeWidth={1.8}
                        fill="currentColor"
                      />
                    )}
                    <OverflowText text={document.title} className="swan-sidebar-doc-title" />
                    <time>{formatUpdatedAt(document.updatedAt)}</time>
                  </span>
                  <span className="swan-sidebar-doc-excerpt">{document.excerpt || '空白文档'}</span>
                </button>
                {!selectionMode && (
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{
                      items: getDocumentMenuItems(document),
                      onClick: ({ key }) => {
                        if (key === 'pin') {
                          onTogglePinned(document);
                          return;
                        }
                        if (key === 'favorite') {
                          onToggleFavorite(document);
                          return;
                        }
                        if (key === 'delete') {
                          onDeleteDocument(document);
                          return;
                        }
                        if (!key.startsWith('move:')) return;
                        const target = key.slice('move:'.length);
                        if (target === 'none') {
                          onMoveDocument(document, null);
                        } else if (isPublicId(target)) {
                          onMoveDocument(document, target);
                        }
                      },
                    }}
                  >
                    <button
                      type="button"
                      className="swan-sidebar-doc-more"
                      aria-label={`更多操作 ${document.title}`}
                      disabled={saveState === 'saving' || deletingDocumentId === document.id}
                    >
                      <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
                    </button>
                  </Dropdown>
                )}
              </div>
            ),
          )
        )}
      </div>

      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            {
              key: 'password',
              icon: <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />,
              label: user.hasPassword ? '修改登录密码' : '设置登录密码',
            },
            ...(!linkedProviders.includes('google')
              ? [
                  {
                    key: 'bind-google',
                    icon: <Link2 aria-hidden="true" size={16} strokeWidth={1.8} />,
                    label: '绑定 Google',
                  },
                ]
              : []),
            ...(!linkedProviders.includes('github')
              ? [
                  {
                    key: 'bind-github',
                    icon: <Link2 aria-hidden="true" size={16} strokeWidth={1.8} />,
                    label: '绑定 GitHub',
                  },
                ]
              : []),
            { type: 'divider' as const },
            {
              key: 'logout',
              icon: <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />,
              label: '退出登录',
            },
          ],
          onClick: ({ key }) => {
            if (key === 'password') onOpenPasswordSettings();
            if (key === 'bind-google') onBindProvider('google');
            if (key === 'bind-github') onBindProvider('github');
            if (key === 'logout') onSignOut();
          },
        }}
      >
        <button type="button" className="swan-sidebar-user">
          <Avatar size={30} src={user.avatarUrl || undefined}>
            {user.name.slice(0, 1).toUpperCase()}
          </Avatar>
          <span className="swan-sidebar-user-copy">
            <strong>{user.name}</strong>
            <small>{user.email ?? `@${user.username ?? '未绑定'}`}</small>
          </span>
          <ChevronDown aria-hidden="true" size={14} strokeWidth={1.8} />
        </button>
      </Dropdown>
    </aside>
  );
}
