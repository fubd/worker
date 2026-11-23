import { useEffect, useRef } from 'react';
import { Avatar, Button, Dropdown, Spin } from 'antd';
import {
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
  documents: DocumentSummary[];
  folderScope: FolderScope;
  folders: FolderSummary[];
  isOpen: boolean;
  listLoading: boolean;
  restoringId: number | null;
  saveState: SaveState;
  searchValue: string;
  user: AuthUser;
  view: DocumentView;
  onBindProvider: (provider: 'google' | 'github') => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onEditFolder: (folder: FolderSummary) => void;
  onFolderSelect: (scope: FolderScope) => void;
  onNavigate: () => void;
  onOpenPasswordSettings: () => void;
  onRestore: (document: DocumentSummary) => void;
  onSearchChange: (value: string) => void;
  onSelect: (id: number) => void;
  onSignOut: () => void;
}

export function WorkspaceSidebar({
  activeId,
  creating,
  documents,
  folderScope,
  folders,
  isOpen,
  listLoading,
  restoringId,
  saveState,
  searchValue,
  user,
  view,
  onBindProvider,
  onCreate,
  onCreateFolder,
  onEditFolder,
  onFolderSelect,
  onNavigate,
  onOpenPasswordSettings,
  onRestore,
  onSearchChange,
  onSelect,
  onSignOut,
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
            <button
              type="button"
              className="swan-sidebar-add"
              aria-label="新建文件夹"
              onClick={onCreateFolder}
            >
              <FolderPlus aria-hidden="true" size={15} strokeWidth={1.8} />
            </button>
          </div>

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
              <button
                type="button"
                key={document.id}
                className={
                  document.id === activeId ? 'swan-sidebar-doc is-selected' : 'swan-sidebar-doc'
                }
                disabled={saveState === 'saving'}
                onClick={() => onSelect(document.id)}
              >
                <span className="swan-sidebar-doc-title-row">
                  <OverflowText text={document.title} className="swan-sidebar-doc-title" />
                  <time>{formatUpdatedAt(document.updatedAt)}</time>
                </span>
                <span className="swan-sidebar-doc-excerpt">{document.excerpt || '空白文档'}</span>
              </button>
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
