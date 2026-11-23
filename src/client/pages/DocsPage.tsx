import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Input, Popconfirm, Spin } from 'antd';
import {
  Bold,
  ChevronRight,
  CodeXml,
  Folder,
  Italic,
  List,
  ListOrdered,
  Menu,
  Plus,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Navigate, useOutletContext, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import type { WorkspaceOutletContext } from '../layouts/workspace-context';
import {
  formatUpdatedAt,
  type DocumentView,
  type FolderScope,
  type SaveState,
} from '../workspace-utils';
import { BRAND } from '@/shared/brand';
import type { DocumentRecord, DocumentSummary, FolderSummary } from '@/shared/types';

const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const FolderDialog = lazy(() => import('../components/FolderDialog'));

function parseDocumentId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.contentText.trim().slice(0, 140),
    folderId: document.folderId,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    deletedAt: document.deletedAt,
  };
}

function parseFolderScope(value: string | null): FolderScope {
  if (value === 'unfiled') return 'unfiled';
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 'all';
}

type FolderDialogState = { mode: 'create' } | { mode: 'rename'; folder: FolderSummary } | null;

function saveStateLabel(state: SaveState): string {
  if (state === 'saving') return '保存中';
  if (state === 'dirty') return '等待保存';
  if (state === 'error') return '保存失败';
  if (state === 'conflict') return '版本冲突';
  return '已保存';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function HydrateFallback() {
  return (
    <div className="swan-workspace">
      <aside className="swan-sidebar">
        <div className="swan-sidebar-brand">
          <span className="swan-sidebar-brand-mark">
            <BrandMark size={34} />
          </span>
          <span className="swan-sidebar-brand-copy">
            <strong>{BRAND.name}</strong>
            <small>{BRAND.tagline}</small>
          </span>
        </div>
        <div className="swan-sidebar-section-head">
          <span>最近编辑</span>
          <span className="swan-sidebar-count">00</span>
        </div>
        <div className="swan-sidebar-empty">正在载入文档…</div>
      </aside>
      <main className="swan-workspace-main">
        <header className="swan-workspace-topbar" />
        <div className="swan-workspace-loading-panel">
          <Spin />
        </div>
      </main>
    </div>
  );
}

export default function DocsPage() {
  return (
    <App>
      <DocsPageContent />
    </App>
  );
}

function DocsPageContent() {
  const { message } = App.useApp();
  const { status, markUnauthenticated } = useAuth();
  const { user, bindProvider, openPasswordSettings, signOut } =
    useOutletContext<WorkspaceOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: DocumentView = searchParams.get('view') === 'trash' ? 'trash' : 'documents';
  const activeId = view === 'documents' ? parseDocumentId(searchParams.get('id')) : null;
  const folderScope = parseFolderScope(searchParams.get('folder'));
  const searchQuery = searchParams.get('q')?.trim() ?? '';

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listRevision, setListRevision] = useState(0);
  const [folderRevision, setFolderRevision] = useState(0);
  const [editorLoading, setEditorLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editRevision, setEditRevision] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [folderName, setFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);

  const activeDocumentRef = useRef<DocumentRecord | null>(null);
  const activeIdRef = useRef<number | null>(activeId);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef('');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  activeIdRef.current = activeId;

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setEditRevision(revisionRef.current);
    setSaveState((current) => (current === 'conflict' ? current : 'dirty'));
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写点什么，内容会自动保存。',
      }),
    ],
    content: EMPTY_CONTENT,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'swan-prosemirror',
        role: 'textbox',
        'aria-label': '文档正文',
        spellcheck: 'false',
      },
    },
    onUpdate: markDirty,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === searchQuery) return;

    const timer = window.setTimeout(() => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (normalized) next.set('q', normalized);
          else next.delete('q');
          next.delete('id');
          return next;
        },
        { replace: true },
      );
    }, 240);

    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, setSearchParams]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setFolders([]);
      return;
    }

    const controller = new AbortController();
    api
      .listFolders({ signal: controller.signal })
      .then(({ items }) => setFolders(items))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文件夹加载失败'));
      });

    return () => controller.abort();
  }, [folderRevision, markUnauthenticated, status]);

  useEffect(() => {
    if (status === 'loading') {
      setListLoading(true);
      return;
    }
    if (status === 'unauthenticated') {
      setDocuments([]);
      setListLoading(false);
      return;
    }

    const controller = new AbortController();
    setListLoading(true);
    setLoadError(null);

    const folderId =
      folderScope === 'all' ? undefined : folderScope === 'unfiled' ? null : folderScope;
    const request =
      view === 'trash'
        ? api.listTrashDocuments({ signal: controller.signal })
        : api.listDocuments({
            signal: controller.signal,
            folderId,
            query: searchQuery,
          });

    request
      .then(({ items }) => {
        setDocuments(items);
        if (view !== 'documents') return;
        if (searchQuery) return;

        setSearchParams(
          (current) => {
            const requestedId = parseDocumentId(current.get('id'));
            if (requestedId && items.some((item) => item.id === requestedId)) return current;
            const next = new URLSearchParams(current);
            if (items[0]) next.set('id', String(items[0].id));
            else next.delete('id');
            return next;
          },
          { replace: true },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文档列表加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });

    return () => controller.abort();
  }, [folderScope, listRevision, markUnauthenticated, searchQuery, setSearchParams, status, view]);

  useEffect(() => {
    if (status !== 'authenticated' || view !== 'documents' || !activeId) {
      activeIdRef.current = null;
      activeDocumentRef.current = null;
      setActiveDocument(null);
      setTitle('');
      titleRef.current = '';
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setEditRevision(0);
      setSaveState('idle');
      editor?.commands.setContent(EMPTY_CONTENT, { emitUpdate: false });
      return;
    }

    const controller = new AbortController();
    setEditorLoading(true);
    setLoadError(null);

    api
      .getDocument(activeId, { signal: controller.signal })
      .then((document) => {
        if (activeIdRef.current !== activeId) return;
        activeDocumentRef.current = document;
        setActiveDocument(document);
        setTitle(document.title);
        titleRef.current = document.title;
        revisionRef.current = 0;
        savedRevisionRef.current = 0;
        setEditRevision(0);
        setSaveState('saved');
        editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeIdRef.current !== activeId) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文档加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted && activeIdRef.current === activeId) {
          setEditorLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeId, editor, markUnauthenticated, status, view]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    const pending = savePromiseRef.current;
    if (pending) return pending;

    const document = activeDocumentRef.current;
    const currentEditor = editorRef.current;
    if (!document || !currentEditor) return false;

    const revision = revisionRef.current;
    const nextTitle = titleRef.current.trim() || '无标题文档';

    if (!titleRef.current.trim()) {
      titleRef.current = nextTitle;
      setTitle(nextTitle);
    }

    setSaveState('saving');

    const task = (async () => {
      try {
        const updated = await api.updateDocument(document.id, {
          version: document.version,
          title: nextTitle,
          content: currentEditor.getJSON() as Record<string, unknown>,
          contentHtml: currentEditor.getHTML(),
          contentText: currentEditor.getText(),
        });

        setDocuments((items) =>
          [toSummary(updated), ...items.filter((item) => item.id !== updated.id)].sort(
            (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
          ),
        );

        if (activeIdRef.current === document.id) {
          activeDocumentRef.current = updated;
          setActiveDocument(updated);
          savedRevisionRef.current = revision;
          setSaveState('saved');
        }
        return true;
      } catch (error) {
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return false;
        }
        if (activeIdRef.current === document.id) {
          setSaveState(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error');
        }
        return false;
      }
    })();

    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }, [markUnauthenticated]);

  useEffect(() => {
    if (
      !activeDocument ||
      !editor ||
      saveState === 'saving' ||
      saveState === 'error' ||
      saveState === 'conflict'
    ) {
      return;
    }
    if (revisionRef.current <= savedRevisionRef.current) return;

    const timer = window.setTimeout(() => {
      void saveDocument();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeDocument, editRevision, editor, saveDocument, saveState]);

  const reloadActiveDocument = async () => {
    if (!activeId) return;
    setEditorLoading(true);
    try {
      const document = await api.getDocument(activeId);
      activeDocumentRef.current = document;
      setActiveDocument(document);
      setTitle(document.title);
      titleRef.current = document.title;
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setEditRevision(0);
      setSaveState('saved');
      editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
      message.success('已加载其他页面的最新版本');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '重新加载失败'));
    } finally {
      setEditorLoading(false);
    }
  };

  const selectDocument = async (id: number) => {
    if (id === activeId) return;
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再切换');
        return;
      }
    }

    activeIdRef.current = id;
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.set('id', String(id));
    setSearchParams(next);
  };

  const createDocument = async () => {
    if (creating || saveState === 'conflict') return;
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再新建');
        return;
      }
    }

    setCreating(true);
    try {
      const folderId = typeof folderScope === 'number' ? folderScope : null;
      const document = await api.createDocument('无标题文档', folderId);
      setDocuments((items) => [toSummary(document), ...items]);
      setFolderRevision((value) => value + 1);
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.set('id', String(document.id));
      setSearchParams(next);
      setSearchInput('');
      message.success('已新建文档');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '新建文档失败'));
    } finally {
      setCreating(false);
    }
  };

  const deleteActiveDocument = async () => {
    const document = activeDocumentRef.current;
    if (!document || deleting || saveState === 'conflict') return;

    setDeleting(true);
    try {
      if (savePromiseRef.current) await savePromiseRef.current;
      await api.deleteDocument(document.id);
      const remaining = documents.filter((item) => item.id !== document.id);
      setDocuments(remaining);
      activeIdRef.current = remaining[0]?.id ?? null;
      activeDocumentRef.current = null;
      setActiveDocument(null);
      setFolderRevision((value) => value + 1);

      const next = new URLSearchParams(searchParams);
      if (remaining[0]) next.set('id', String(remaining[0].id));
      else next.delete('id');
      setSearchParams(next, { replace: true });
      message.success('文档已移入回收站');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const restoreDocument = async (document: DocumentSummary) => {
    if (restoringId !== null) return;
    setRestoringId(document.id);
    try {
      await api.restoreDocument(document.id);
      setDocuments((items) => items.filter((item) => item.id !== document.id));
      setFolderRevision((value) => value + 1);
      message.success('文档已恢复');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '恢复失败'));
    } finally {
      setRestoringId(null);
    }
  };

  const selectFolder = (scope: FolderScope) => {
    setSidebarOpen(false);
    setSearchInput('');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      if (scope === 'all') next.delete('folder');
      else next.set('folder', String(scope));
      return next;
    });
  };

  const openCreateFolder = () => {
    setFolderName('');
    setFolderDialog({ mode: 'create' });
  };

  const openEditFolder = (folder: FolderSummary) => {
    setFolderName(folder.name);
    setFolderDialog({ mode: 'rename', folder });
  };

  const saveFolder = async () => {
    const name = folderName.trim();
    if (!folderDialog || !name || folderSaving) return;

    setFolderSaving(true);
    try {
      if (folderDialog.mode === 'create') {
        const folder = await api.createFolder(name);
        setFolders((items) =>
          [...items, folder].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
        );
        setFolderDialog(null);
        setFolderRevision((value) => value + 1);
        selectFolder(folder.id);
        message.success('文件夹已创建');
      } else {
        const folder = await api.renameFolder(folderDialog.folder.id, name);
        setFolders((items) =>
          items
            .map((item) => (item.id === folder.id ? folder : item))
            .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
        );
        setFolderDialog(null);
        setFolderRevision((value) => value + 1);
        message.success('文件夹已重命名');
      }
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '文件夹保存失败'));
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async () => {
    if (!folderDialog || folderDialog.mode !== 'rename' || folderDeleting) return;
    const { folder } = folderDialog;

    setFolderDeleting(true);
    try {
      await api.deleteFolder(folder.id);
      setFolders((items) => items.filter((item) => item.id !== folder.id));
      setFolderDialog(null);
      setFolderRevision((value) => value + 1);
      setListRevision((value) => value + 1);
      if (folderScope === folder.id) {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete('folder');
          next.delete('id');
          next.delete('q');
          return next;
        });
      }
      message.success('文件夹已删除，文档已移到未归档');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '文件夹删除失败'));
    } finally {
      setFolderDeleting(false);
    }
  };

  const moveActiveDocument = async (folderId: number | null) => {
    const document = activeDocumentRef.current;
    if (!document || moving || document.folderId === folderId) return;

    setMoving(true);
    try {
      const updated = await api.moveDocument(document.id, folderId);
      activeDocumentRef.current = updated;
      setActiveDocument(updated);
      setDocuments((items) =>
        items.map((item) => (item.id === updated.id ? toSummary(updated) : item)),
      );
      setFolderRevision((value) => value + 1);
      setListRevision((value) => value + 1);
      message.success(folderId === null ? '文档已移到未归档' : '文档已移动');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '移动文档失败'));
    } finally {
      setMoving(false);
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    markDirty();
  };

  if (status === 'loading') return <HydrateFallback />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  const characterCount = editor?.getText().trim().length ?? 0;
  const selectedFolder =
    typeof folderScope === 'number'
      ? folders.find((folder) => folder.id === folderScope)
      : undefined;

  return (
    <div className={sidebarOpen ? 'swan-workspace is-sidebar-open' : 'swan-workspace'}>
      <WorkspaceSidebar
        activeId={activeId}
        creating={creating}
        documents={documents}
        folderScope={folderScope}
        folders={folders}
        isOpen={sidebarOpen}
        listLoading={listLoading}
        restoringId={restoringId}
        saveState={saveState}
        searchValue={searchInput}
        user={user}
        view={view}
        onBindProvider={bindProvider}
        onCreate={() => {
          setSidebarOpen(false);
          void createDocument();
        }}
        onCreateFolder={openCreateFolder}
        onEditFolder={openEditFolder}
        onFolderSelect={selectFolder}
        onNavigate={() => setSidebarOpen(false)}
        onOpenPasswordSettings={openPasswordSettings}
        onRestore={(document) => void restoreDocument(document)}
        onSearchChange={(value) => {
          setSearchInput(value);
          if (view === 'trash' && value.trim()) {
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('view');
              return next;
            });
          }
        }}
        onSelect={(id) => {
          setSidebarOpen(false);
          void selectDocument(id);
        }}
        onSignOut={() => void signOut()}
      />

      {sidebarOpen && (
        <button
          type="button"
          className="swan-sidebar-scrim"
          aria-label="关闭菜单"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="swan-workspace-main">
        <header className="swan-workspace-topbar">
          <div className="swan-workspace-location">
            <button
              type="button"
              className="swan-workspace-menu-button"
              aria-label="打开菜单"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu aria-hidden="true" size={18} strokeWidth={1.8} />
            </button>
            <nav className="swan-editor-breadcrumb" aria-label="当前位置">
              <span>{view === 'trash' ? '回收站' : '全部文档'}</span>
              {view === 'documents' && (
                <>
                  <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
                  <strong>
                    {searchQuery
                      ? `搜索：${searchQuery}`
                      : (selectedFolder?.name ??
                        (folderScope === 'unfiled' ? '未归档' : '私人笔记'))}
                  </strong>
                </>
              )}
            </nav>
          </div>

          {view === 'documents' && activeDocument && (
            <div className="swan-workspace-actions">
              <span className={`swan-save-state is-${saveState}`}>
                <span className="swan-save-dot" aria-hidden="true" />
                {saveStateLabel(saveState)}
              </span>
              {saveState === 'error' && (
                <Button size="small" type="link" onClick={() => void saveDocument()}>
                  重试
                </Button>
              )}
              {saveState === 'conflict' && (
                <Button size="small" type="link" onClick={() => void reloadActiveDocument()}>
                  重新加载
                </Button>
              )}
              <Popconfirm
                title="将这篇文档移入回收站？"
                description="你之后可以从回收站恢复。"
                okText="移入回收站"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => void deleteActiveDocument()}
              >
                <Button
                  type="text"
                  danger
                  icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />}
                  loading={deleting}
                  disabled={saveState === 'conflict'}
                  aria-label="删除文档"
                />
              </Popconfirm>
            </div>
          )}
        </header>

        {(loadError || saveState === 'conflict') && (
          <div className="swan-workspace-notices">
            {loadError && (
              <Alert
                type="error"
                showIcon
                title={loadError}
                closable
                onClose={() => setLoadError(null)}
              />
            )}
            {saveState === 'conflict' && (
              <Alert
                type="warning"
                showIcon
                title="这篇文档已在其他页面更新"
                description="当前编辑内容仍保留在页面上。重新加载会使用服务器上的最新版本。"
                action={
                  <Button
                    size="small"
                    icon={<RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />}
                    onClick={() => void reloadActiveDocument()}
                  >
                    重新加载
                  </Button>
                }
              />
            )}
          </div>
        )}

        {view === 'trash' ? (
          <div className="swan-workspace-empty">
            <div className="swan-empty-state">
              <strong>回收站里还没有可编辑的文档</strong>
              <span>恢复后会重新出现在全部文档中。</span>
            </div>
          </div>
        ) : editorLoading || !editor ? (
          <div className="swan-workspace-empty">
            <Spin />
          </div>
        ) : !activeDocument ? (
          <div className="swan-workspace-empty">
            <div className="swan-empty-state">
              <strong>从一张空白纸开始</strong>
              <span>新建一篇文档，开始让文字飞起来。</span>
              <Button
                type="primary"
                icon={<Plus aria-hidden="true" size={16} strokeWidth={1.8} />}
                onClick={() => void createDocument()}
              >
                新建文档
              </Button>
            </div>
          </div>
        ) : (
          <div className="swan-editor-canvas">
            <div className="swan-editor-stage">
              <aside className="swan-editor-margin">
                <span>DOCUMENT</span>
                <strong>{String(activeDocument.id).padStart(2, '0')}</strong>
                <span>{formatUpdatedAt(activeDocument.updatedAt)}</span>
                <span>第 {activeDocument.version} 版</span>
                <span>{characterCount} 字</span>
              </aside>

              <article className="swan-editor-page">
                <span className="swan-editor-kicker">私人笔记 · 写作</span>
                <Input.TextArea
                  variant="borderless"
                  className="swan-doc-title-input"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  value={title}
                  maxLength={200}
                  placeholder="无标题文档"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  onChange={(event) => handleTitleChange(event.target.value)}
                />
                <div className="swan-editor-submeta">
                  <span>更改会自动保存</span>
                  <span>最近保存 {formatUpdatedAt(activeDocument.updatedAt)}</span>
                  <label className="swan-doc-folder-select">
                    <Folder aria-hidden="true" size={13} strokeWidth={1.8} />
                    <span className="swan-sr-only">文档文件夹</span>
                    <select
                      value={activeDocument.folderId ?? ''}
                      disabled={moving}
                      aria-label="文档文件夹"
                      onChange={(event) =>
                        void moveActiveDocument(
                          event.target.value ? Number(event.target.value) : null,
                        )
                      }
                    >
                      <option value="">未归档</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <EditorToolbar editor={editor} />
                <div className="swan-tiptap">
                  <EditorContent editor={editor} />
                </div>
                <div className="swan-editor-meta">
                  <span>{characterCount} 字</span>
                  <span>V{activeDocument.version}</span>
                </div>
              </article>

              <aside className="swan-editor-margin is-right" aria-hidden="true" />
            </div>
          </div>
        )}
      </main>

      {folderDialog && (
        <Suspense fallback={null}>
          <FolderDialog
            key={folderDialog.mode === 'create' ? 'create' : `rename-${folderDialog.folder.id}`}
            mode={folderDialog.mode}
            name={folderName}
            saving={folderSaving}
            deleting={folderDeleting}
            onChange={setFolderName}
            onClose={() => {
              if (!folderSaving && !folderDeleting) setFolderDialog(null);
            }}
            onDelete={deleteFolder}
            onSubmit={() => void saveFolder()}
          />
        </Suspense>
      )}
    </div>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="swan-editor-toolbar" role="toolbar" aria-label="文档格式">
      <Button
        size="small"
        type={editor.isActive('heading', { level: 1 }) ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Button>
      <Button
        size="small"
        type={editor.isActive('heading', { level: 2 }) ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Button>
      <Button
        size="small"
        type={editor.isActive('bold') ? 'primary' : 'text'}
        icon={<Bold aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        size="small"
        type={editor.isActive('italic') ? 'primary' : 'text'}
        icon={<Italic aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Button
        size="small"
        type={editor.isActive('bulletList') ? 'primary' : 'text'}
        icon={<List aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="无序列表"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        size="small"
        type={editor.isActive('orderedList') ? 'primary' : 'text'}
        icon={<ListOrdered aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="有序列表"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Button
        size="small"
        type={editor.isActive('blockquote') ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        引用
      </Button>
      <Button
        size="small"
        type={editor.isActive('codeBlock') ? 'primary' : 'text'}
        icon={<CodeXml aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="代码块"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <span className="swan-editor-toolbar-spacer" />
      <Button
        size="small"
        type="text"
        icon={<Undo2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="撤销"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <Button
        size="small"
        type="text"
        icon={<Redo2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="重做"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}
