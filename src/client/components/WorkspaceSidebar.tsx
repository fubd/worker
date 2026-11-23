import { useEffect, useRef } from 'react';
import { Avatar, Button, Dropdown, Spin, Tooltip, type MenuProps } from 'antd';
import {
  Check,
  ChevronDown,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router';

import { BRAND } from '@/shared/brand';
import type { AuthUser, DocumentSummary, FolderSummary } from '@/shared/types';
import { BrandMark } from './BrandMark';
import { OverflowText } from './OverflowText';
import {
  formatUpdatedAt,
  type DocumentView,
  type FolderScope,
  type SaveState,
} from '../workspace-utils';

interface WorkspaceSidebarProps {
  activeId: number | null;
  creating: boolean;
  creatingFolder: boolean;
  deletingDocumentId: number | null;
  documents: DocumentSummary[];
  folderDraft: string;
  folderScope: FolderScope;
  folderSaving: boolean;
  folders: FolderSummary[];
  isOpen: boolean;
  listLoading: boolean;
  restoringId: number | null;
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
  onMoveDocument: (document: DocumentSummary, folderId: number | null) => void;
  onNavigate: () => void;
  onOpenPasswordSettings: () => void;
  onRestore: (document: DocumentSummary) => void;
  onSearchChange: (value: string) => void;
  onSelect: (id: number) => void;
  onSignOut: () => void;
  onSubmitFolderCreate: () => void;
}

export function WorkspaceSidebar({
  activeId,
  creating,
  creatingFolder,
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
  onNavigate,
  onOpenPasswordSettings,
  onRestore,
  onSearchChange,
  onSelect,
  onSignOut,
  onSubmitFolderCreate,
}: WorkspaceSidebarProps) {
  const linkedProviders = user.linkedProviders;
  const searchRef = useRef<HTMLInputElement>(null);
  const hasSearch = searchValue.trim().length > 0;
  const sectionTitle =
    view === 'trash'
      ? '已删除'
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
        .map((folder) => ({ key: `move:${folder.id}`, label: folder.name })),
    ];

    return [
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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
          ref={searchRef}
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
          <div className="swan-sidebar-section-head">
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

          {creatingFolder && (
            <form
              className="swan-folder-create"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitFolderCreate();
              }}
            >
              <Folder aria-hidden="true" size={15} strokeWidth={1.8} />
              <input
                autoFocus
                maxLength={30}
                value={folderDraft}
                aria-label="新文件夹名称"
                placeholder="文件夹名称"
                onChange={(event) => onFolderDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onCancelFolderCreate();
                }}
              />
              <button
                type="submit"
                aria-label="创建文件夹"
                disabled={folderSaving || !folderDraft.trim()}
              >
                <Check aria-hidden="true" size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="取消新建文件夹"
                disabled={folderSaving}
                onClick={onCancelFolderCreate}
              >
                <X aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            </form>
          )}

          <button
            type="button"
            className={
              folderScope === 'unfiled' ? 'swan-folder-row is-selected' : 'swan-folder-row'
            }
            onClick={() => onFolderSelect('unfiled')}
          >
            <Folder aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>未归档</span>
          </button>

          {folders.map((folder) => (
            <div
              className={
                folderScope === folder.id ? 'swan-folder-item is-selected' : 'swan-folder-item'
              }
              key={folder.id}
            >
              <button
                type="button"
                className="swan-folder-row"
                onClick={() => onFolderSelect(folder.id)}
              >
                <Folder aria-hidden="true" size={15} strokeWidth={1.8} />
                <OverflowText text={folder.name} />
                <small>{folder.documentCount}</small>
              </button>
              <button
                type="button"
                className="swan-folder-edit"
                aria-label={`管理文件夹 ${folder.name}`}
                onClick={() => onEditFolder(folder)}
              >
                <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
            </div>
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
          <div className="swan-sidebar-empty">
            <Spin size="small" />
          </div>
        ) : documents.length === 0 ? (
          <div className="swan-sidebar-empty">
            {view === 'trash' ? '回收站是空的' : hasSearch ? '没有匹配的文档' : '这里还没有文档'}
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
                <button
                  type="button"
                  className={
                    document.id === activeId ? 'swan-sidebar-doc is-selected' : 'swan-sidebar-doc'
                  }
                  disabled={saveState === 'saving' || deletingDocumentId === document.id}
                  onClick={() => onSelect(document.id)}
                >
                  <span className="swan-sidebar-doc-title-row">
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
                      if (key === 'delete') {
                        onDeleteDocument(document);
                        return;
                      }
                      if (!key.startsWith('move:')) return;
                      const target = key.slice('move:'.length);
                      onMoveDocument(document, target === 'none' ? null : Number(target));
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
