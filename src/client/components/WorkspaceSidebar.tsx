import { useEffect, useState, type CSSProperties, type DragEvent as ReactDragEvent } from 'react';
import { Avatar, Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  CheckSquare,
  FileDown,
  FileUp,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Link2,
  LockKeyhole,
  LogOut,
  MoreVertical,
  Pencil,
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
import { FolderCreateForm, FolderTreeItem } from './SidebarFolderTree';
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
  documentChildren: Record<PublicId, DocumentSummary[]>;
  expandedDocumentIds: ReadonlySet<PublicId>;
  folderDraft: string;
  folderScope: FolderScope;
  folderSaving: boolean;
  folders: FolderSummary[];
  hasMore: boolean;
  isOpen: boolean;
  listLoading: boolean;
  loadingMore: boolean;
  purgingId: PublicId | null;
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
  onDeleteFolder: (folder: FolderSummary) => void;
  onEditFolder: (folder: FolderSummary) => void;
  onFolderCreateDocument: (folder: FolderSummary) => void;
  onFolderDraftChange: (value: string) => void;
  onImport: () => void;
  onLoadMore: () => void;
  onMoveDocument: (document: DocumentSummary, folderId: PublicId | null) => void;
  onMoveDocumentToParent: (
    document: DocumentSummary,
    folderId: PublicId | null,
    parentId: PublicId | null,
  ) => void;
  onMoveFolder: (folder: FolderSummary, parentId: PublicId | null) => void;
  onNavigate: () => void;
  onOpenPasswordSettings: () => void;
  onPermanentlyDelete: (document: DocumentSummary) => void;
  onRestore: (document: DocumentSummary) => void;
  onSearchChange: (value: string) => void;
  onSelect: (id: PublicId) => void;
  onCreateChildDocument: (parent: DocumentSummary) => void;
  onSignOut: () => void;
  onSubmitFolderCreate: () => void;
  onToggleFavorite: (document: DocumentSummary) => void;
  onToggleDocumentExpanded: (documentId: PublicId) => void;
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
  documentChildren: initialDocumentChildren,
  expandedDocumentIds,
  folderDraft,
  folderScope,
  folderSaving,
  folders,
  hasMore,
  isOpen,
  listLoading,
  loadingMore,
  purgingId,
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
  onDeleteFolder,
  onEditFolder,
  onFolderCreateDocument,
  onFolderDraftChange,
  onImport,
  onLoadMore,
  onMoveDocument,
  onMoveDocumentToParent,
  onMoveFolder,
  onNavigate,
  onOpenPasswordSettings,
  onPermanentlyDelete,
  onRestore,
  onSearchChange,
  onSelect,
  onCreateChildDocument,
  onSignOut,
  onSubmitFolderCreate,
  onToggleFavorite,
  onToggleDocumentExpanded,
  onTogglePinned,
  onToggleDocumentSelection,
  onToggleSelectAll,
  onToggleSelectionMode,
}: WorkspaceSidebarProps) {
  'use no memo';

  const linkedProviders = user.linkedProviders;
  const hasSearch = searchValue.trim().length > 0;
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
    if (view !== 'documents' || searchValue.trim()) return;
    setExpandedFolderIds((current) => {
      const wanted = new Set(
        isPublicId(folderScope)
          ? getFolderAncestors(folders, folderScope).map((folder) => folder.id)
          : [],
      );
      for (const document of documents) {
        if (document.id !== activeId || !document.folderId) continue;
        for (const folder of getFolderAncestors(folders, document.folderId)) {
          wanted.add(folder.id);
        }
      }
      if ([...wanted].every((id) => current.has(id))) return current;
      return new Set([...current, ...wanted]);
    });
  }, [activeId, documents, folderScope, folders, searchValue, view]);

  const setFolderExpanded = (folderId: PublicId, expanded: boolean) => {
    setExpandedFolderIds((current) => {
      if (current.has(folderId) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(folderId);
      else next.delete(folderId);
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

  const sectionTitle =
    view === 'documents'
      ? hasSearch
        ? '搜索结果'
        : '文档树'
      : view === 'trash'
        ? '已删除'
        : view === 'favorites'
          ? '收藏'
          : view === 'recent'
            ? '最近浏览'
            : '文档';
  const currentFolder = isPublicId(folderScope)
    ? folders.find((folder) => folder.id === folderScope)
    : undefined;
  const directChildFolderCount = currentFolder
    ? folders.filter((folder) => folder.parentId === currentFolder.id).length
    : 0;
  const sectionSummary =
    view === 'documents' && currentFolder && !hasSearch
      ? `${directChildFolderCount} 个分组 · ${currentFolder.documentCount} 篇文档`
      : null;
  const documentsByFolder = new Map<PublicId, DocumentSummary[]>();
  const rootDocuments: DocumentSummary[] = [];
  for (const document of documents) {
    if (document.parentId !== null) continue;
    if (document.folderId === null) {
      rootDocuments.push(document);
      continue;
    }
    const folderDocuments = documentsByFolder.get(document.folderId);
    if (folderDocuments) folderDocuments.push(document);
    else documentsByFolder.set(document.folderId, [document]);
  }
  for (const node of folders) {
    const items = initialDocumentChildren[node.id];
    if (!items) continue;
    const topLevel = items.filter((document) => document.parentId === null);
    if (topLevel.length > 0) {
      const known = documentsByFolder.get(node.id) ?? [];
      const folderItems = [
        ...known,
        ...topLevel.filter((item) => !known.some((document) => document.id === item.id)),
      ];
      documentsByFolder.set(node.id, view === 'documents' ? folderItems : known);
    }
  }
  const folderTree = buildFolderTree(folders);
  const showDocumentTree = view === 'documents' && !hasSearch;
  const selectedDocuments = documents.filter((document) => selectedDocumentIds.has(document.id));
  const selectedIds = selectedDocuments.map((document) => document.id);
  const selectedCount = selectedDocuments.length;
  const allSelected = documents.length > 0 && selectedCount === documents.length;
  const allSelectedFavorite =
    selectedCount > 0 && selectedDocuments.every((document) => document.favorite);
  const someSelectedFavorite = selectedDocuments.some((document) => document.favorite);

  const getFolderMoveTargets = (folder: FolderSummary) => {
    if (folder.parentId === null) return [];
    return folders
      .filter(
        (target) =>
          target.id !== folder.id &&
          target.id !== folder.parentId &&
          !isFolderInSubtree(folders, target.id, folder.id),
      )
      .map((target) => ({
        key: `move:${target.id}`,
        label: getFolderPathLabel(folders, target.id),
      }));
  };

  const getFolderMenuItems = (folder: FolderSummary): MenuProps['items'] => {
    const moveTargets = [
      ...(folder.parentId === null ? [] : [{ key: 'move:none', label: '顶层' }]),
      ...getFolderMoveTargets(folder),
    ];

    return [
      {
        key: 'create-child',
        label: '新建分组',
        icon: <FolderPlus aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
      ...(moveTargets.length
        ? [
            {
              key: 'move',
              label: '移动到分组',
              icon: <Folder aria-hidden="true" size={15} strokeWidth={1.8} />,
              children: moveTargets,
            },
          ]
        : []),
      { type: 'divider' as const },
      {
        key: 'rename',
        label: '重命名',
        icon: <Pencil aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
      {
        key: 'delete',
        label: '删除',
        danger: true,
        icon: <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
    ];
  };

  const batchMoveItems: MenuProps['items'] = [
    { key: 'move:none', label: '根目录' },
    ...folders.map((folder) => ({
      key: `move:${folder.id}`,
      label: getFolderPathLabel(folders, folder.id),
    })),
  ].map(({ key, label }) => ({
    key,
    label,
    icon: <Folder aria-hidden="true" size={15} strokeWidth={1.8} />,
  }));

  const batchMenuItems: MenuProps['items'] = [
    {
      key: 'move',
      label: '移动到',
      icon: <FolderInput aria-hidden="true" size={15} strokeWidth={1.8} />,
      children: batchMoveItems,
    },
    {
      key: 'favorite',
      label: allSelectedFavorite ? '取消收藏' : '收藏',
      icon: (
        <Star
          aria-hidden="true"
          size={15}
          strokeWidth={1.8}
          fill={allSelectedFavorite ? 'currentColor' : 'none'}
        />
      ),
      disabled: !allSelectedFavorite && !someSelectedFavorite,
    },
    {
      key: 'export',
      label: '导出',
      icon: <FileDown aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '移入回收站',
      danger: true,
      icon: <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
  ];

  const handleFolderMenuAction = (folder: FolderSummary, key: string) => {
    if (key === 'create-child') {
      onCreateFolder(folder.id);
      return;
    }
    if (key === 'rename') {
      onEditFolder(folder);
      return;
    }
    if (key === 'delete') {
      onDeleteFolder(folder);
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

  const allChildDocuments = Object.values(initialDocumentChildren).flat();
  const getDocumentMoveTargets = (document: DocumentSummary) => {
    return [
      ...(document.parentId === null && document.folderId === null
        ? []
        : [{ key: 'move:none', label: '根目录' }]),
      ...folders.map((folder) => ({
        key: `move:folder:${folder.id}`,
        label: getFolderPathLabel(folders, folder.id),
      })),
      ...documents
        .filter((target) => target.id !== document.id)
        .map((target) => ({ key: `move:document:${target.id}`, label: target.title })),
      ...allChildDocuments
        .filter((target) => target.id !== document.id)
        .map((target) => ({ key: `move:document:${target.id}`, label: target.title })),
    ];
  };

  const getDocumentMenuItems = (document: DocumentSummary): MenuProps['items'] => {
    const moveTargets = getDocumentMoveTargets(document);

    return [
      {
        key: 'create-child',
        label: '新建子文档',
        icon: <Plus aria-hidden="true" size={15} strokeWidth={1.8} />,
      },
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
              label: '移动到',
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

  const renderDocumentRow = (source: DocumentSummary, depth = 0) => {
    const document = source;
    if (view === 'trash') {
      return (
        <div className="swan-sidebar-doc is-trash" key={document.id}>
          <OverflowText text={document.title} className="swan-sidebar-doc-title" />
          <span className="swan-sidebar-doc-excerpt">{document.excerpt || '空白文档'}</span>
          <span className="swan-sidebar-doc-time">
            删除于 {formatUpdatedAt(document.deletedAt ?? document.updatedAt)}
          </span>
          <div className="swan-sidebar-trash-actions">
            <Button
              size="small"
              icon={<RotateCcw aria-hidden="true" size={13} strokeWidth={1.8} />}
              loading={restoringId === document.id}
              disabled={purgingId === document.id}
              onClick={() => onRestore(document)}
            >
              恢复
            </Button>
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 aria-hidden="true" size={13} strokeWidth={1.8} />}
              loading={purgingId === document.id}
              disabled={restoringId === document.id}
              aria-label={`永久删除 ${document.title}`}
              onClick={() => onPermanentlyDelete(document)}
            >
              永久删除
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={[
          'swan-sidebar-doc-item',
          selectionMode ? 'is-selecting' : '',
          document.childCount > 0 ? 'has-children' : '',
          expandedDocumentIds.has(document.id) ? 'is-expanded' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        key={document.id}
        style={depth ? ({ '--swan-doc-depth': depth } as CSSProperties) : undefined}
      >
        {!selectionMode && document.childCount > 0 && (
          <button
            type="button"
            className={
              expandedDocumentIds.has(document.id)
                ? 'swan-document-toggle is-expanded'
                : 'swan-document-toggle'
            }
            aria-label={expandedDocumentIds.has(document.id) ? '收起子文档' : '展开子文档'}
            aria-expanded={expandedDocumentIds.has(document.id)}
            onClick={() => onToggleDocumentExpanded(document.id)}
          >
            <ChevronRight aria-hidden="true" size={12} strokeWidth={1.8} />
          </button>
        )}
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
            <FileText
              className="swan-sidebar-doc-icon"
              aria-hidden="true"
              size={14}
              strokeWidth={1.7}
            />
            <OverflowText text={document.title} className="swan-sidebar-doc-title" />
            {(document.favorite || document.pinned) && (
              <span className="swan-sidebar-doc-markers">
                {document.favorite && (
                  <Star
                    className="swan-sidebar-doc-favorite"
                    aria-label="已收藏"
                    size={11}
                    strokeWidth={1.8}
                    fill="currentColor"
                  />
                )}
                {document.pinned && (
                  <Pin
                    className="swan-sidebar-doc-pinned"
                    aria-label="已置顶"
                    size={10}
                    strokeWidth={1.8}
                    fill="currentColor"
                  />
                )}
              </span>
            )}
            <time>{formatUpdatedAt(document.updatedAt)}</time>
          </span>
          <span className="swan-sidebar-doc-excerpt">{document.excerpt || '空白文档'}</span>
        </button>
        {!selectionMode && (
          <div className="swan-sidebar-doc-actions">
            {document.childCount > 0 && <span aria-hidden="true" />}
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: getDocumentMenuItems(document),
                onClick: ({ key }) => {
                  if (key === 'create-child') {
                    onCreateChildDocument(document);
                    return;
                  }
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
                  } else if (target.startsWith('folder:')) {
                    const folderId = target.slice('folder:'.length);
                    if (isPublicId(folderId)) onMoveDocument(document, folderId);
                  } else if (target.startsWith('document:')) {
                    const parentId = target.slice('document:'.length);
                    const parent = [...documents, ...allChildDocuments].find(
                      (item) => item.id === parentId,
                    );
                    if (parent) onMoveDocumentToParent(document, parent.folderId, parent.id);
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
                <MoreVertical aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </Dropdown>
          </div>
        )}
        {!selectionMode && expandedDocumentIds.has(document.id) && (
          <div className="swan-document-children">
            {(initialDocumentChildren[document.id] ?? [])
              .filter((child) => child.parentId === document.id)
              .map((child) => renderDocumentRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderDocumentRows = (items: DocumentSummary[], depth = 0) =>
    items.map((document) => renderDocumentRow(document, depth));

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
          <FileText
            className="swan-nav-icon is-documents"
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
          />
          <span>全部文档</span>
        </Link>
        <Link
          className={view === 'recent' ? 'is-selected' : undefined}
          to="/docs?view=recent"
          onClick={onNavigate}
        >
          <Clock3
            className="swan-nav-icon is-recent"
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
          />
          <span>最近浏览</span>
        </Link>
        <Link
          className={view === 'favorites' ? 'is-selected' : undefined}
          to="/docs?view=favorites"
          onClick={onNavigate}
        >
          <Star
            className="swan-nav-icon is-favorites"
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
          />
          <span>收藏</span>
        </Link>
        <Link
          className={view === 'trash' ? 'is-selected' : undefined}
          to="/docs?view=trash"
          onClick={onNavigate}
        >
          <Trash2
            className="swan-nav-icon is-trash"
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
          />
          <span>回收站</span>
        </Link>
      </nav>

      <div className="swan-sidebar-scroll">
        <div
          className={
            dropTargetId === 'folder-root'
              ? 'swan-sidebar-section-head is-drop-target'
              : 'swan-sidebar-section-head'
          }
          onDragOver={(event) => {
            if (!draggingItem || view !== 'documents') return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            handleDragOverTarget('folder-root');
          }}
          onDragLeave={(event) => {
            if (view !== 'documents') return;
            event.stopPropagation();
            handleDragLeaveTarget('folder-root');
          }}
          onDrop={(event) => {
            if (view !== 'documents') return;
            event.preventDefault();
            finishDrop(event, null);
          }}
        >
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
                {!sectionSummary && !showDocumentTree && (
                  <span className="swan-sidebar-count">
                    {String(documents.length).padStart(2, '0')}
                  </span>
                )}
                {view === 'documents' && (
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    destroyOnHidden
                    menu={{
                      items: [
                        {
                          key: 'document',
                          label: '新建文档',
                          icon: (
                            <FileText
                              className="swan-menu-icon is-document"
                              aria-hidden="true"
                              size={16}
                              strokeWidth={1.8}
                            />
                          ),
                          disabled: creating || saveState === 'conflict',
                        },
                        {
                          key: 'folder',
                          label: '新建分组',
                          icon: (
                            <FolderPlus
                              className="swan-menu-icon is-folder"
                              aria-hidden="true"
                              size={16}
                              strokeWidth={1.8}
                            />
                          ),
                        },
                        {
                          key: 'import',
                          label: '导入文档',
                          icon: (
                            <FileUp
                              className="swan-menu-icon is-import"
                              aria-hidden="true"
                              size={16}
                              strokeWidth={1.8}
                            />
                          ),
                          disabled: creating || saveState === 'conflict',
                        },
                        ...(documents.length > 0
                          ? [
                              { type: 'divider' as const },
                              {
                                key: 'select',
                                label: '批量选择',
                                icon: (
                                  <CheckSquare aria-hidden="true" size={16} strokeWidth={1.8} />
                                ),
                                disabled: listLoading,
                              },
                            ]
                          : []),
                      ],
                      onClick: ({ key }) => {
                        if (key === 'document') onCreate();
                        if (key === 'folder') onCreateFolder(null);
                        if (key === 'import') onImport();
                        if (key === 'select') onToggleSelectionMode();
                      },
                    }}
                  >
                    <button
                      type="button"
                      className="swan-sidebar-add"
                      aria-label="新建或导入"
                      aria-haspopup="menu"
                    >
                      <Plus aria-hidden="true" size={16} strokeWidth={1.9} />
                    </button>
                  </Dropdown>
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
              destroyOnHidden
              disabled={batchBusy || selectedCount === 0}
              menu={{
                items: batchMenuItems,
                onClick: ({ key }) => {
                  if (key === 'favorite') {
                    onBatchFavorite(selectedIds, !allSelectedFavorite);
                  }
                  if (key === 'export') onBatchExport(selectedIds);
                  if (key === 'delete') onBatchDelete(selectedIds);
                },
              }}
            >
              <Button
                className="swan-sidebar-batch-more"
                type="text"
                icon={<MoreVertical aria-hidden="true" size={16} strokeWidth={1.8} />}
                aria-label="所选文档操作"
                disabled={batchBusy || selectedCount === 0}
              />
            </Dropdown>
            <span className="swan-sidebar-batch-status" aria-live="polite">
              {batchBusy ? '处理中…' : `已选 ${selectedCount} 项`}
            </span>
          </div>
        )}

        <div
          className={showDocumentTree ? 'swan-sidebar-doc-list is-tree' : 'swan-sidebar-doc-list'}
        >
          {listLoading && documents.length === 0 ? (
            <DocumentListSkeleton />
          ) : showDocumentTree ? (
            <div className="swan-sidebar-tree">
              {creatingFolder && creatingFolderParentId === null && (
                <FolderCreateForm
                  draft={folderDraft}
                  saving={folderSaving}
                  onCancel={onCancelFolderCreate}
                  onChange={onFolderDraftChange}
                  onSubmit={onSubmitFolderCreate}
                />
              )}

              <div className="swan-sidebar-root-documents">{renderDocumentRows(rootDocuments)}</div>

              {folderTree.map((node) => (
                <FolderTreeItem
                  key={node.folder.id}
                  activeFolderId={isPublicId(folderScope) ? folderScope : null}
                  creatingFolder={creatingFolder}
                  creatingFolderParentId={creatingFolderParentId}
                  documentsByFolder={documentsByFolder}
                  draggingItem={draggingItem}
                  dropTargetId={dropTargetId}
                  expandedFolderIds={expandedFolderIds}
                  folders={folders}
                  folderDraft={folderDraft}
                  folderSaving={folderSaving}
                  getFolderMenuItems={getFolderMenuItems}
                  node={node}
                  rootLevel
                  onBeginDrag={beginDrag}
                  onCancelFolderCreate={onCancelFolderCreate}
                  onDragEnd={resetDrag}
                  onDragLeaveTarget={handleDragLeaveTarget}
                  onDragOverTarget={handleDragOverTarget}
                  onDropTarget={finishDrop}
                  onEditFolder={onEditFolder}
                  onFolderCreateChild={(folder) => {
                    setExpandedFolderIds((current) => new Set(current).add(folder.id));
                    onCreateFolder(folder.id);
                  }}
                  onFolderCreateDocument={(folder) => onFolderCreateDocument(folder)}
                  onFolderMenuAction={handleFolderMenuAction}
                  onFolderDraftChange={onFolderDraftChange}
                  onSubmitFolderCreate={onSubmitFolderCreate}
                  onSetExpanded={setFolderExpanded}
                  renderDocuments={renderDocumentRows}
                />
              ))}

              {documents.length === 0 && folders.length === 0 && (
                <div className="swan-sidebar-empty">这里还没有文档</div>
              )}
            </div>
          ) : !listLoading && documents.length === 0 ? (
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
            renderDocumentRows(documents)
          )}
          {!listLoading && hasMore && (
            <Button
              className="swan-sidebar-load-more"
              type="text"
              size="small"
              loading={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? '正在载入…' : '载入更多文档'}
            </Button>
          )}
        </div>
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
