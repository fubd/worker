import { useEffect, useState, type DragEvent as ReactDragEvent } from 'react';
import { Avatar, Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import {
  ChevronDown,
  Clock3,
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
  user: AuthUser;
  view: DocumentView;
  onBindProvider: (provider: 'google' | 'github') => void;
  onCancelFolderCreate: () => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onDeleteDocument: (document: DocumentSummary) => void;
  onEditFolder: (folder: FolderSummary) => void;
  onFolderDraftChange: (value: string) => void;
  onFolderSelect: (scope: FolderScope) => void;
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
  user,
  view,
  onBindProvider,
  onCancelFolderCreate,
  onCreate,
  onCreateFolder,
  onDeleteDocument,
  onEditFolder,
  onFolderDraftChange,
  onFolderSelect,
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
                onClick={onCreateFolder}
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
              node={node}
              onBeginDrag={beginDrag}
              onCancelFolderCreate={onCancelFolderCreate}
              onDragEnd={resetDrag}
              onDragLeaveTarget={handleDragLeaveTarget}
              onDragOverTarget={handleDragOverTarget}
              onDropTarget={finishDrop}
              onEditFolder={onEditFolder}
              onFolderDraftChange={onFolderDraftChange}
              onFolderSelect={onFolderSelect}
              onSubmitFolderCreate={onSubmitFolderCreate}
              onToggleExpanded={toggleFolderExpanded}
            />
          ))}
        </div>
      )}

      <div className="swan-sidebar-section-head">
        <OverflowText text={sectionTitle} className="swan-sidebar-section-title" />
        <span className="swan-sidebar-section-actions">
          <span className="swan-sidebar-count">{String(documents.length).padStart(2, '0')}</span>
          {view === 'documents' && (
            <button
              type="button"
              className="swan-sidebar-add"
              aria-label="新建文档"
              disabled={creating || saveState === 'conflict'}
              onClick={onCreate}
            >
              <Plus aria-hidden="true" size={15} strokeWidth={1.8} />
            </button>
          )}
        </span>
      </div>

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
              <div className="swan-sidebar-doc-item" key={document.id}>
                <DocumentDragHandle
                  document={document}
                  dragging={draggingItem?.kind === 'document' && draggingItem.id === document.id}
                  onBeginDrag={beginDrag}
                  onDragEnd={resetDrag}
                />
                <button
                  type="button"
                  className={
                    document.id === activeId ? 'swan-sidebar-doc is-selected' : 'swan-sidebar-doc'
                  }
                  disabled={saveState === 'saving' || deletingDocumentId === document.id}
                  onClick={() => onSelect(document.id)}
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
