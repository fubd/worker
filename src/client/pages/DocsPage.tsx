import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Dropdown, Input, Modal, type MenuProps } from 'antd';
import {
  Bold,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  Clock3,
  CloudCheck,
  CodeXml,
  FileDown,
  Folder,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Menu,
  MoreVertical,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import Placeholder from '@tiptap/extension-placeholder';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';
import { OverflowText } from '../components/OverflowText';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import type { WorkspaceOutletContext } from '../layouts/workspace-context';
import {
  formatUpdatedAt,
  type DocumentView,
  type FolderScope,
  type SaveState,
} from '../workspace-utils';
import { BRAND } from '@/shared/brand';
import { isDocumentId, isFolderId, type DocumentId, type FolderId } from '@/shared/ids';
import { DOCUMENT_TITLE_MAX_LENGTH } from '@/shared/limits';
import type { DocumentRecord, DocumentSummary, FolderSummary } from '@/shared/types';

const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const FolderDialog = lazy(() => import('../components/FolderDialog'));

function parseDocumentId(value: string | null | undefined): DocumentId | null {
  return isDocumentId(value) ? value : null;
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.contentText.trim().slice(0, 140),
    folderId: document.folderId,
    favorite: document.favorite,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    deletedAt: document.deletedAt,
  };
}

function sortDocumentSummaries(items: DocumentSummary[]): DocumentSummary[] {
  return [...items].sort(
    (left, right) =>
      Number(right.favorite) - Number(left.favorite) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      right.id.localeCompare(left.id),
  );
}

function parseFolderScope(value: string | null): FolderScope {
  if (value === 'unfiled') return 'unfiled';
  return isFolderId(value) ? value : 'all';
}

function docsRoute(id: DocumentId | null, search: URLSearchParams) {
  const query = search.toString();
  return {
    pathname: id ? `/docs/${id}` : '/docs',
    search: query ? `?${query}` : '',
  };
}

type FolderDialogState = { folder: FolderSummary } | null;
type DocumentMode = 'read' | 'edit';

function formatLastEditedAt(value: string, now: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';

  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return formatUpdatedAt(value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function formatDocumentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function safeMarkdownFilename(title: string): string {
  const filename = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 80);
  return `${filename || '无标题文档'}.md`;
}

async function editorMarkdown(editor: Editor, title: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const converter = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  const body = converter.turndown(editor.getHTML()).trim();
  const normalizedTitle = title.trim() || '无标题文档';
  return `# ${normalizedTitle}${body ? `\n\n${body}` : ''}\n`;
}

function downloadMarkdown(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function HydrateFallback() {
  return (
    <div className="swan-workspace swan-workspace-is-loading" aria-busy="true">
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
        <div className="swan-sidebar-loading" aria-hidden="true">
          <div className="swan-loading-surface">
            <div className="swan-skeleton-bar is-search" />
            <div className="swan-skeleton-bar is-nav" />
            <div className="swan-skeleton-bar is-nav is-short" />
            <div className="swan-skeleton-bar is-section" />
            <div className="swan-skeleton-bar is-folder" />
            <div className="swan-skeleton-bar is-folder" />
            <div className="swan-skeleton-bar is-section" />
            <div className="swan-skeleton-document">
              <div className="swan-skeleton-bar is-document-title" />
              <div className="swan-skeleton-bar is-document-copy" />
            </div>
            <div className="swan-skeleton-document">
              <div className="swan-skeleton-bar is-document-title" />
              <div className="swan-skeleton-bar is-document-copy" />
            </div>
            <div className="swan-skeleton-document">
              <div className="swan-skeleton-bar is-document-title" />
              <div className="swan-skeleton-bar is-document-copy" />
            </div>
          </div>
        </div>
      </aside>
      <main className="swan-workspace-main">
        <header className="swan-workspace-topbar">
          <div className="swan-topbar-skeleton swan-loading-surface" aria-hidden="true">
            <div className="swan-skeleton-bar is-topbar-title" />
            <div className="swan-skeleton-bar is-topbar-actions" />
          </div>
        </header>
        <DocumentSkeleton />
      </main>
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div
      className="swan-editor-canvas swan-document-loading"
      role="status"
      aria-label="正在加载文档"
    >
      <div className="swan-editor-stage">
        <aside className="swan-editor-margin" aria-hidden="true">
          <span>DOCUMENT</span>
          <div className="swan-skeleton-bar is-margin" />
          <div className="swan-skeleton-bar is-margin is-short" />
          <div className="swan-skeleton-bar is-margin is-short" />
        </aside>
        <article className="swan-editor-page">
          <span className="swan-editor-kicker">私人笔记 · 写作</span>
          <div className="swan-document-skeleton swan-loading-surface" aria-hidden="true">
            <div className="swan-skeleton-bar is-title" />
            <div className="swan-skeleton-meta">
              <div className="swan-skeleton-bar is-meta" />
              <div className="swan-skeleton-bar is-meta is-short" />
              <div className="swan-skeleton-bar is-meta is-folder-meta" />
            </div>
            <div className="swan-skeleton-bar is-toolbar" />
            <div className="swan-skeleton-copy">
              <div className="swan-skeleton-bar is-copy" />
              <div className="swan-skeleton-bar is-copy is-wide" />
              <div className="swan-skeleton-bar is-copy" />
              <div className="swan-skeleton-bar is-copy is-short" />
            </div>
          </div>
        </article>
        <aside className="swan-editor-margin is-right" aria-hidden="true" />
      </div>
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
  const { message, modal } = App.useApp();
  const { status, markUnauthenticated } = useAuth();
  const { user, bindProvider, openPasswordSettings, signOut } =
    useOutletContext<WorkspaceOutletContext>();
  const { documentId } = useParams<{ documentId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedView = searchParams.get('view');
  const view: DocumentView =
    requestedView === 'trash' ? 'trash' : requestedView === 'favorites' ? 'favorites' : 'documents';
  const activeId = view !== 'trash' ? parseDocumentId(documentId) : null;
  const folderScope = parseFolderScope(searchParams.get('folder'));
  const searchQuery = searchParams.get('q')?.trim() ?? '';
  const authUnavailable = status === 'unauthenticated';

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [documentMode, setDocumentMode] = useState<DocumentMode>('read');
  const [listLoading, setListLoading] = useState(true);
  const [listRevision, setListRevision] = useState(0);
  const [folderRevision, setFolderRevision] = useState(0);
  const [editorLoading, setEditorLoading] = useState(false);
  const [showDocumentLoading, setShowDocumentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<DocumentId | null>(null);
  const [moving, setMoving] = useState(false);
  const [restoringId, setRestoringId] = useState<DocumentId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [documentInfoOpen, setDocumentInfoOpen] = useState(false);

  const activeDocumentRef = useRef<DocumentRecord | null>(null);
  const activeIdRef = useRef<DocumentId | null>(activeId);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef('');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveDocumentRef = useRef<() => Promise<boolean>>(async () => false);
  const navigateRef = useRef(navigate);
  const createdDocumentIdRef = useRef<DocumentId | null>(null);
  const documentModesRef = useRef(new Map<DocumentId, DocumentMode>());

  activeIdRef.current = activeId;
  navigateRef.current = navigate;

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const scheduleSave = useCallback(() => {
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveDocumentRef.current();
    }, 900);
  }, [clearSaveTimer]);

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setSaveState((current) => (current === 'saving' || current === 'conflict' ? current : 'dirty'));
    scheduleSave();
  }, [scheduleSave]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写点什么，内容会自动保存。',
      }),
    ],
    content: EMPTY_CONTENT,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
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
    if (!editor) return;
    editor.setEditable(documentMode === 'edit', false);
    editor.view.dom.setAttribute('aria-readonly', String(documentMode !== 'edit'));
  }, [documentMode, editor]);

  useEffect(() => clearSaveTimer, [clearSaveTimer]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === searchQuery) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (normalized) next.set('q', normalized);
      else next.delete('q');
      next.delete('id');
      navigate(docsRoute(null, next), { replace: true });
    }, 240);

    return () => window.clearTimeout(timer);
  }, [navigate, searchInput, searchParams, searchQuery]);

  useEffect(() => {
    if (authUnavailable) {
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
  }, [authUnavailable, folderRevision, markUnauthenticated]);

  useEffect(() => {
    if (authUnavailable) {
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
            folderId: view === 'favorites' ? undefined : folderId,
            query: searchQuery,
            favoriteOnly: view === 'favorites',
          });

    request
      .then(({ items }) => {
        setDocuments(items);
        if (view === 'trash') return;
        if (searchQuery) return;

        const requestedId = activeIdRef.current;
        if (requestedId && items.some((item) => item.id === requestedId)) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        navigateRef.current(docsRoute(items[0]?.id ?? null, next), { replace: true });
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
  }, [
    authUnavailable,
    folderScope,
    listRevision,
    markUnauthenticated,
    searchParams,
    searchQuery,
    view,
  ]);

  useEffect(() => {
    clearSaveTimer();
    setDocumentInfoOpen(false);
    if (createdDocumentIdRef.current !== activeId) {
      createdDocumentIdRef.current = null;
    }
    const openInEdit =
      activeId !== null &&
      (createdDocumentIdRef.current === activeId ||
        documentModesRef.current.get(activeId) === 'edit');
    setDocumentMode(openInEdit ? 'edit' : 'read');

    if (authUnavailable || view === 'trash' || !activeId) {
      if (authUnavailable) documentModesRef.current.clear();
      activeIdRef.current = null;
      activeDocumentRef.current = null;
      setActiveDocument(null);
      titleRef.current = '';
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
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
        titleRef.current = document.title;
        revisionRef.current = 0;
        savedRevisionRef.current = 0;
        setSaveState('idle');
        editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
        if (editor && createdDocumentIdRef.current === activeId) {
          createdDocumentIdRef.current = null;
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeIdRef.current !== activeId) return;
        if (createdDocumentIdRef.current === activeId) {
          createdDocumentIdRef.current = null;
        }
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
  }, [activeId, authUnavailable, clearSaveTimer, editor, markUnauthenticated, view]);

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
    }

    clearSaveTimer();
    setSaveState('saving');

    const task = (async () => {
      try {
        const updated = await api.updateDocument(document.id, {
          version: document.version,
          ...(nextTitle !== document.title ? { title: nextTitle } : {}),
          content: currentEditor.getJSON() as Record<string, unknown>,
          contentHtml: currentEditor.getHTML(),
          contentText: currentEditor.getText(),
        });

        setDocuments((items) =>
          items.map((item) => (item.id === updated.id ? toSummary(updated) : item)),
        );

        if (activeIdRef.current === document.id) {
          activeDocumentRef.current = updated;
          setActiveDocument(updated);
          savedRevisionRef.current = revision;
          if (revisionRef.current > revision) {
            setSaveState('dirty');
            scheduleSave();
          } else {
            setSaveState('saved');
          }
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
  }, [clearSaveTimer, markUnauthenticated, scheduleSave]);

  saveDocumentRef.current = saveDocument;

  const savePendingChanges = async (): Promise<boolean> => {
    while (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) return false;
    }
    return true;
  };

  const reloadActiveDocument = async () => {
    if (!activeId) return;
    setEditorLoading(true);
    try {
      const document = await api.getDocument(activeId);
      activeDocumentRef.current = document;
      setActiveDocument(document);
      titleRef.current = document.title;
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setSaveState('idle');
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

  const selectDocument = async (id: DocumentId) => {
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
    if (view !== 'favorites') next.delete('view');
    next.delete('id');
    navigate(docsRoute(id, next));
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
      const folderId = isFolderId(folderScope) ? folderScope : null;
      const document = await api.createDocument('无标题文档', folderId);
      createdDocumentIdRef.current = document.id;
      documentModesRef.current.set(document.id, 'edit');
      setDocuments((items) => [toSummary(document), ...items]);
      setFolderRevision((value) => value + 1);
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      navigate(docsRoute(document.id, next));
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

  const deleteDocument = async (document: Pick<DocumentSummary, 'id'>) => {
    if (deletingDocumentId !== null) return;
    const isActive = activeDocumentRef.current?.id === document.id;
    if (isActive && saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }

    setDeletingDocumentId(document.id);
    try {
      if (isActive && savePromiseRef.current) await savePromiseRef.current;
      await api.deleteDocument(document.id);
      documentModesRef.current.delete(document.id);
      const remaining = documents.filter((item) => item.id !== document.id);
      setDocuments(remaining);
      setFolderRevision((value) => value + 1);

      if (isActive) {
        activeIdRef.current = remaining[0]?.id ?? null;
        activeDocumentRef.current = null;
        setActiveDocument(null);

        const next = new URLSearchParams(searchParams);
        next.delete('id');
        navigate(docsRoute(remaining[0]?.id ?? null, next), { replace: true });
      }
      message.success('文档已移入回收站');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '删除失败'));
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const requestDeleteDocument = (document: Pick<DocumentSummary, 'id' | 'title'>) => {
    if (deletingDocumentId !== null) return;
    modal.confirm({
      title: '将这篇文档移入回收站？',
      content: document.title,
      okText: '移入回收站',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteDocument(document),
    });
  };

  const documentActionItems: MenuProps['items'] = [
    {
      key: 'copy-link',
      label: '复制链接',
      icon: <Link2 aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'copy-markdown',
      label: '复制 Markdown',
      icon: <ClipboardCopy aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'download-markdown',
      label: '下载 Markdown',
      icon: <FileDown aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    { type: 'divider' },
    {
      key: 'info',
      label: '文档信息',
      icon: <Info aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'print',
      label: '打印',
      icon: <Printer aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '移入回收站',
      danger: true,
      icon: <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
  ];

  const runDocumentAction = async (key: string) => {
    if (!activeDocument || !editor) return;

    if (key === 'copy-link') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('q');
      url.searchParams.delete('id');
      url.pathname = `/docs/${activeDocument.id}`;
      try {
        await navigator.clipboard.writeText(url.toString());
        message.success('文档链接已复制');
      } catch {
        message.error('复制链接失败，请检查浏览器权限');
      }
      return;
    }

    if (key === 'copy-markdown' || key === 'download-markdown') {
      const hideLoading = message.loading('正在生成 Markdown...', 0);
      try {
        const title = titleRef.current.trim() || activeDocument.title;
        const markdown = await editorMarkdown(editor, title);
        if (key === 'copy-markdown') {
          await navigator.clipboard.writeText(markdown);
          message.success('Markdown 已复制');
        } else {
          downloadMarkdown(markdown, safeMarkdownFilename(title));
          message.success('Markdown 已下载');
        }
      } catch {
        message.error('生成 Markdown 失败');
      } finally {
        hideLoading();
      }
      return;
    }

    if (key === 'info') {
      setDocumentInfoOpen(true);
      return;
    }

    if (key === 'print') {
      window.requestAnimationFrame(() => window.print());
      return;
    }

    if (key === 'delete') {
      requestDeleteDocument(activeDocument);
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
    setCreatingFolder(false);
    setSearchInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.delete('q');
    next.delete('id');
    if (scope === 'all') next.delete('folder');
    else next.set('folder', scope);
    navigate(docsRoute(null, next));
  };

  const openCreateFolder = () => {
    setFolderDialog(null);
    setFolderName('');
    setCreatingFolder(true);
  };

  const cancelCreateFolder = () => {
    if (folderSaving) return;
    setCreatingFolder(false);
    setFolderName('');
  };

  const openEditFolder = (folder: FolderSummary) => {
    setCreatingFolder(false);
    setFolderName(folder.name);
    setFolderDialog({ folder });
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!creatingFolder || !name || folderSaving) return;

    setFolderSaving(true);
    try {
      const folder = await api.createFolder(name);
      setFolders((items) =>
        [...items, folder].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      );
      setCreatingFolder(false);
      setFolderName('');
      setFolderRevision((value) => value + 1);
      selectFolder(folder.id);
      message.success('文件夹已创建');
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

  const renameFolder = async () => {
    const name = folderName.trim();
    if (!folderDialog || !name || folderSaving) return;

    setFolderSaving(true);
    try {
      const folder = await api.renameFolder(folderDialog.folder.id, name);
      setFolders((items) =>
        items
          .map((item) => (item.id === folder.id ? folder : item))
          .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      );
      setFolderDialog(null);
      setFolderRevision((value) => value + 1);
      message.success('文件夹已重命名');
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
    if (!folderDialog || folderDeleting) return;
    const { folder } = folderDialog;

    setFolderDeleting(true);
    try {
      await api.deleteFolder(folder.id);
      setFolders((items) => items.filter((item) => item.id !== folder.id));
      setFolderDialog(null);
      setFolderRevision((value) => value + 1);
      setListRevision((value) => value + 1);
      if (folderScope === folder.id) {
        const next = new URLSearchParams(searchParams);
        next.delete('folder');
        next.delete('id');
        next.delete('q');
        navigate(docsRoute(null, next));
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

  const moveDocument = async (
    document: Pick<DocumentSummary, 'id' | 'folderId'>,
    folderId: FolderId | null,
  ) => {
    if (moving || document.folderId === folderId) return;

    setMoving(true);
    try {
      const updated = await api.moveDocument(document.id, folderId);
      if (activeDocumentRef.current?.id === updated.id) {
        activeDocumentRef.current = updated;
        setActiveDocument(updated);
      }
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

  const toggleFavorite = async (document: Pick<DocumentSummary, 'id' | 'favorite'>) => {
    try {
      const updated = await api.setDocumentFavorite(document.id, !document.favorite);
      if (activeDocumentRef.current?.id === updated.id) {
        activeDocumentRef.current = updated;
        setActiveDocument(updated);
      }
      setDocuments((items) => {
        const next = items.filter((item) => item.id !== updated.id);
        if (updated.favorite || view !== 'favorites') next.push(toSummary(updated));
        return sortDocumentSummaries(next);
      });
      message.success('已更新');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, document.favorite ? '取消收藏失败' : '收藏失败'));
    }
  };

  const handleTitleChange = useCallback(
    (value: string) => {
      titleRef.current = value;
      markDirty();
    },
    [markDirty],
  );

  const enterEditMode = () => {
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }
    if (activeDocumentRef.current) {
      documentModesRef.current.set(activeDocumentRef.current.id, 'edit');
    }
    setDocumentMode('edit');
  };

  const finishEditing = async () => {
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }

    const saved = await savePendingChanges();
    if (!saved) {
      message.error('保存失败，暂时无法退出编辑模式');
      return;
    }
    if (activeDocumentRef.current) {
      documentModesRef.current.delete(activeDocumentRef.current.id);
    }
    setDocumentMode('read');
  };

  const documentPending =
    !loadError &&
    (activeId === null
      ? activeDocument !== null || (!searchQuery && (listLoading || documents.length > 0))
      : activeDocument?.id !== activeId);

  useEffect(() => {
    if (!documentPending || activeDocument !== null) {
      setShowDocumentLoading(false);
      return;
    }

    const timer = window.setTimeout(() => setShowDocumentLoading(true), 80);
    return () => window.clearTimeout(timer);
  }, [activeDocument, documentPending]);

  if (status === 'loading') return <HydrateFallback />;
  if (status === 'unauthenticated' || !user) return <Navigate to="/login" replace />;

  const selectedFolder = isFolderId(folderScope)
    ? folders.find((folder) => folder.id === folderScope)
    : undefined;
  const breadcrumbFolder = searchQuery
    ? `搜索：${searchQuery}`
    : (selectedFolder?.name ?? (folderScope === 'unfiled' ? '未归档' : '私人笔记'));
  const activeFolderName =
    activeDocument?.folderId == null
      ? '未归档'
      : (folders.find((folder) => folder.id === activeDocument.folderId)?.name ?? '文件夹');
  const reloadingActiveDocument = editorLoading && activeDocument?.id === activeId;
  const documentLoadingVisible =
    reloadingActiveDocument || (documentPending && (!activeDocument || showDocumentLoading));

  return (
    <div className={sidebarOpen ? 'swan-workspace is-sidebar-open' : 'swan-workspace'}>
      <WorkspaceSidebar
        activeId={activeId}
        creating={creating}
        creatingFolder={creatingFolder}
        deletingDocumentId={deletingDocumentId}
        documents={documents}
        folderDraft={folderName}
        folderScope={folderScope}
        folderSaving={folderSaving}
        folders={folders}
        isOpen={sidebarOpen}
        listLoading={listLoading}
        restoringId={restoringId}
        saveState={saveState}
        searchValue={searchInput}
        user={user}
        view={view}
        onBindProvider={bindProvider}
        onCancelFolderCreate={cancelCreateFolder}
        onCreate={() => {
          setSidebarOpen(false);
          void createDocument();
        }}
        onCreateFolder={openCreateFolder}
        onDeleteDocument={requestDeleteDocument}
        onEditFolder={openEditFolder}
        onFolderDraftChange={setFolderName}
        onFolderSelect={selectFolder}
        onMoveDocument={(document, folderId) => void moveDocument(document, folderId)}
        onNavigate={() => setSidebarOpen(false)}
        onOpenPasswordSettings={openPasswordSettings}
        onRestore={(document) => void restoreDocument(document)}
        onSearchChange={(value) => {
          setSearchInput(value);
          if (view === 'trash' && value.trim()) {
            const next = new URLSearchParams(searchParams);
            next.delete('view');
            next.delete('id');
            navigate(docsRoute(null, next));
          }
        }}
        onSelect={(id) => {
          setSidebarOpen(false);
          void selectDocument(id);
        }}
        onSignOut={() => void signOut()}
        onSubmitFolderCreate={() => void createFolder()}
        onToggleFavorite={(document) => void toggleFavorite(document)}
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
              <span className="swan-editor-breadcrumb-root">
                {view === 'trash' ? '回收站' : view === 'favorites' ? '收藏' : '全部文档'}
              </span>
              {view === 'documents' && (
                <>
                  <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
                  <OverflowText text={breadcrumbFolder} className="swan-editor-breadcrumb-folder" />
                </>
              )}
            </nav>
          </div>

          {view !== 'trash' && activeDocument && !documentPending && !reloadingActiveDocument && (
            <div className="swan-workspace-actions">
              <SaveStatus state={saveState} updatedAt={activeDocument.updatedAt} />
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
              <Button
                className={
                  activeDocument.favorite
                    ? 'swan-document-favorite-button is-active'
                    : 'swan-document-favorite-button'
                }
                type="text"
                icon={
                  <Star
                    aria-hidden="true"
                    size={17}
                    strokeWidth={1.8}
                    fill={activeDocument.favorite ? 'currentColor' : 'none'}
                  />
                }
                aria-label={activeDocument.favorite ? '取消收藏' : '收藏'}
                aria-pressed={activeDocument.favorite}
                onClick={() => void toggleFavorite(activeDocument)}
              />
              <Button
                className={
                  documentMode === 'edit'
                    ? 'swan-document-mode-button is-completing'
                    : 'swan-document-mode-button'
                }
                type="text"
                onClick={() => (documentMode === 'edit' ? void finishEditing() : enterEditMode())}
              >
                {documentMode === 'edit' ? '完成' : '编辑'}
              </Button>
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: documentActionItems,
                  onClick: ({ key }) => void runDocumentAction(key),
                }}
              >
                <Button
                  className="swan-workspace-more"
                  type="text"
                  icon={<MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />}
                  aria-label="文档操作"
                />
              </Dropdown>
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
        ) : !editor || documentLoadingVisible ? (
          <DocumentSkeleton />
        ) : !activeDocument ? (
          <div className="swan-workspace-empty">
            <div className="swan-empty-state">
              {view === 'favorites' ? (
                <>
                  <strong>还没有收藏</strong>
                  <span>在文档右上角点击星标，收藏的文档会置顶并集中显示在这里。</span>
                </>
              ) : (
                <>
                  <strong>从一张空白纸开始</strong>
                  <span>新建一篇文档，开始让文字飞起来。</span>
                  <Button
                    type="primary"
                    icon={<Plus aria-hidden="true" size={16} strokeWidth={1.8} />}
                    onClick={() => void createDocument()}
                  >
                    新建文档
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            className={
              documentPending || reloadingActiveDocument
                ? 'swan-editor-canvas is-document-switching'
                : 'swan-editor-canvas'
            }
            aria-busy={documentPending || reloadingActiveDocument || undefined}
          >
            <div className="swan-editor-stage">
              <aside className="swan-editor-margin">
                <span>DOCUMENT</span>
                <span>{formatUpdatedAt(activeDocument.updatedAt)}</span>
                <span>第 {activeDocument.version} 版</span>
                <span>
                  <EditorCharacterCount editor={editor} /> 字
                </span>
              </aside>

              <article className={`swan-editor-page is-${documentMode}-mode`}>
                <span className="swan-editor-kicker">私人笔记 · 写作</span>
                <DocumentTitleInput
                  key={activeDocument.id}
                  initialValue={activeDocument.title}
                  mode={documentMode}
                  onChange={handleTitleChange}
                />
                <div className="swan-editor-submeta">
                  <span>{documentMode === 'edit' ? '更改会自动保存' : '最近更新'}</span>
                  <span>
                    {documentMode === 'edit' ? '最近保存 ' : ''}
                    {formatUpdatedAt(activeDocument.updatedAt)}
                  </span>
                  <span className="swan-doc-folder">
                    <Folder aria-hidden="true" size={13} strokeWidth={1.8} />
                    <span className="swan-doc-folder-value">
                      <OverflowText text={activeFolderName} className="swan-doc-folder-label" />
                    </span>
                  </span>
                </div>

                {documentMode === 'edit' && <EditorToolbar editor={editor} />}
                <div className="swan-tiptap">
                  <EditorContent editor={editor} />
                </div>
                <div className="swan-editor-meta">
                  <span>
                    <EditorCharacterCount editor={editor} /> 字
                  </span>
                  <span>V{activeDocument.version}</span>
                </div>
              </article>

              <DocumentOutline editor={editor} />
            </div>
          </div>
        )}
      </main>

      {activeDocument && editor && (
        <Modal
          open={documentInfoOpen}
          title="文档信息"
          width={480}
          centered
          footer={null}
          className="swan-document-info-modal"
          onCancel={() => setDocumentInfoOpen(false)}
        >
          <dl className="swan-document-info-list">
            <div>
              <dt>标题</dt>
              <dd>{titleRef.current.trim() || activeDocument.title}</dd>
            </div>
            <div>
              <dt>文档 ID</dt>
              <dd>
                <code>{activeDocument.id}</code>
              </dd>
            </div>
            <div>
              <dt>所在位置</dt>
              <dd>{activeFolderName}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{formatDocumentDate(activeDocument.createdAt)}</dd>
            </div>
            <div>
              <dt>最后更新</dt>
              <dd>{formatDocumentDate(activeDocument.updatedAt)}</dd>
            </div>
            <div>
              <dt>当前版本</dt>
              <dd>第 {activeDocument.version} 版</dd>
            </div>
            <div>
              <dt>字数</dt>
              <dd>{editor.getText().trim().length} 字</dd>
            </div>
          </dl>
        </Modal>
      )}

      {folderDialog && (
        <Suspense fallback={null}>
          <FolderDialog
            key={`rename-${folderDialog.folder.id}`}
            name={folderName}
            saving={folderSaving}
            deleting={folderDeleting}
            onChange={setFolderName}
            onClose={() => {
              if (!folderSaving && !folderDeleting) setFolderDialog(null);
            }}
            onDelete={deleteFolder}
            onSubmit={() => void renameFolder()}
          />
        </Suspense>
      )}
    </div>
  );
}

function SaveStatus({ state, updatedAt }: { state: SaveState; updatedAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state !== 'idle') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const syncing = state === 'dirty' || state === 'saving';
  const Icon =
    state === 'error'
      ? CircleAlert
      : state === 'conflict'
        ? TriangleAlert
        : syncing
          ? LoaderCircle
          : state === 'saved'
            ? CloudCheck
            : Clock3;
  const label =
    state === 'error'
      ? '保存失败'
      : state === 'conflict'
        ? '版本冲突'
        : syncing
          ? '正在保存...'
          : state === 'saved'
            ? '已保存'
            : `上次编辑 ${formatLastEditedAt(updatedAt, now)}`;

  return (
    <span className={`swan-save-state is-${state}`} aria-live="polite">
      <Icon
        className={syncing ? 'swan-save-icon is-spinning' : 'swan-save-icon'}
        aria-hidden="true"
        size={14}
        strokeWidth={1.8}
      />
      <span>{label}</span>
    </span>
  );
}

function DocumentTitleInput({
  initialValue,
  mode,
  onChange,
}: {
  initialValue: string;
  mode: DocumentMode;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  if (mode === 'read') {
    return <h1 className="swan-doc-title-display">{value.trim() || '无标题文档'}</h1>;
  }

  return (
    <Input.TextArea
      variant="borderless"
      className="swan-doc-title-input"
      autoSize={{ minRows: 1 }}
      value={value}
      maxLength={DOCUMENT_TITLE_MAX_LENGTH}
      placeholder="无标题文档"
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault();
      }}
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
}

function EditorCharacterCount({ editor }: { editor: Editor }) {
  const count = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.getText().trim().length,
  });

  return count;
}

function DocumentOutline({ editor }: { editor: Editor }) {
  const [collapsed, setCollapsed] = useState(false);
  const headings = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const items: Array<{ level: number; pos: number; text: string }> = [];
      currentEditor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return;
        const level = Number(node.attrs.level);
        const text = node.textContent.trim();
        if (level >= 1 && level <= 3 && text) {
          items.push({ level, pos, text });
        }
      });
      return items;
    },
  });

  if (headings.length === 0) {
    return <aside className="swan-editor-margin is-right" aria-hidden="true" />;
  }

  const jumpToHeading = (pos: number) => {
    const node = editor.view.nodeDOM(pos);
    if (!(node instanceof HTMLElement)) return;

    node.scrollIntoView({ behavior: 'auto', block: 'center' });
    if (editor.isEditable) {
      editor
        .chain()
        .setTextSelection(pos + 1)
        .focus()
        .run();
    }
  };

  return (
    <aside className="swan-editor-margin is-right swan-document-outline" aria-label="文档大纲">
      <div className="swan-document-outline-head">
        {!collapsed && <span>大纲</span>}
        <button
          type="button"
          aria-label={collapsed ? '展开文档大纲' : '收起文档大纲'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronRight
            className={collapsed ? undefined : 'is-expanded'}
            aria-hidden="true"
            size={14}
            strokeWidth={1.8}
          />
        </button>
      </div>
      {!collapsed && (
        <nav className="swan-document-outline-list">
          {headings.map((heading) => (
            <button
              type="button"
              className={`swan-document-outline-item is-h${heading.level}`}
              key={`${heading.pos}-${heading.text}`}
              title={heading.text}
              onClick={() => jumpToHeading(heading.pos)}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const activeFormats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      h1: currentEditor.isActive('heading', { level: 1 }),
      h2: currentEditor.isActive('heading', { level: 2 }),
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      blockquote: currentEditor.isActive('blockquote'),
      codeBlock: currentEditor.isActive('codeBlock'),
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  });

  return (
    <div className="swan-editor-toolbar" role="toolbar" aria-label="文档格式">
      <Button
        size="small"
        type={activeFormats.h1 ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Button>
      <Button
        size="small"
        type={activeFormats.h2 ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Button>
      <Button
        size="small"
        type={activeFormats.bold ? 'primary' : 'text'}
        icon={<Bold aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        size="small"
        type={activeFormats.italic ? 'primary' : 'text'}
        icon={<Italic aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Button
        size="small"
        type={activeFormats.bulletList ? 'primary' : 'text'}
        icon={<List aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="无序列表"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        size="small"
        type={activeFormats.orderedList ? 'primary' : 'text'}
        icon={<ListOrdered aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="有序列表"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Button
        size="small"
        type={activeFormats.blockquote ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        引用
      </Button>
      <Button
        size="small"
        type={activeFormats.codeBlock ? 'primary' : 'text'}
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
        disabled={!activeFormats.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <Button
        size="small"
        type="text"
        icon={<Redo2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="重做"
        disabled={!activeFormats.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}
