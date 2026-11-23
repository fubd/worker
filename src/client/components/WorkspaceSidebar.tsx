import { Avatar, Button, Dropdown, Spin } from 'antd';
import {
  ChevronDown,
  FileText,
  Link2,
  LockKeyhole,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router';

import { BRAND } from '@/shared/brand';
import type { AuthUser, DocumentSummary } from '@/shared/types';
import { BrandMark } from './BrandMark';
import { formatUpdatedAt, type DocumentView, type SaveState } from '../workspace-utils';

interface WorkspaceSidebarProps {
  activeId: number | null;
  creating: boolean;
  documents: DocumentSummary[];
  isOpen: boolean;
  listLoading: boolean;
  restoringId: number | null;
  saveState: SaveState;
  user: AuthUser;
  view: DocumentView;
  onBindProvider: (provider: 'google' | 'github') => void;
  onCreate: () => void;
  onNavigate: () => void;
  onOpenPasswordSettings: () => void;
  onRestore: (document: DocumentSummary) => void;
  onSelect: (id: number) => void;
  onSignOut: () => void;
}

export function WorkspaceSidebar({
  activeId,
  creating,
  documents,
  isOpen,
  listLoading,
  restoringId,
  saveState,
  user,
  view,
  onBindProvider,
  onCreate,
  onNavigate,
  onOpenPasswordSettings,
  onRestore,
  onSelect,
  onSignOut,
}: WorkspaceSidebarProps) {
  const linkedProviders = user.linkedProviders;

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

      <nav className="swan-sidebar-nav" aria-label="站点导航">
        <Link
          className={view === 'documents' ? 'is-selected' : undefined}
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

      <div className="swan-sidebar-section-head">
        <span>{view === 'trash' ? '已删除' : '最近编辑'}</span>
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
            {view === 'trash' ? '回收站是空的' : '还没有文档'}
          </div>
        ) : (
          documents.map((document) =>
            view === 'trash' ? (
              <div className="swan-sidebar-doc is-trash" key={document.id}>
                <strong>{document.title}</strong>
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
                  <strong>{document.title}</strong>
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
