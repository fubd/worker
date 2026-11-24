import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Dropdown, Modal, type MenuProps } from 'antd';
import {
  ChevronRight,
  ClipboardCopy,
  Clock3,
  Copy,
  FileDown,
  Folder,
  Info,
  Link2,
  Link2Off,
  Menu,
  MoreVertical,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Navigate,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useParams,
  useRevalidator,
  useSearchParams,
  type LoaderFunction,
} from 'react-router';

import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';
import {
  DocumentOutline,
  DocumentSkeleton,
  DocumentTitleInput,
  EditorCharacterCount,
  EditorToolbar,
  SaveStatus,
} from '../components/docs/DocsEditor';
import { OverflowText } from '../components/OverflowText';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import { emptyDocsRouteData, loadDocsRouteData, type DocsRouteData } from '../docs-loader';
import type { WorkspaceOutletContext } from '../layouts/workspace-context';
import {
  getFolderAncestors,
  getFolderPathLabel,
  getFolderSubtreeIds,
  isFolderInSubtree,
} from '../folder-utils';
import {
  formatUpdatedAt,
  parseDocumentView,
  type DocumentMode,
  type DocumentView,
  type FolderScope,
  type SaveState,
} from '../workspace-utils';
import { BRAND } from '@/shared/brand';
import { isPublicId, type PublicId } from '@/shared/ids';
import type {
  DocumentImportInput,
  DocumentRecord,
  DocumentSummary,
  FolderSummary,
} from '@/shared/types';

const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const FolderDialog = lazy(() => import('../components/FolderDialog'));
const ImportDocumentModal = lazy(
  () => import(/* webpackChunkName: "document-import" */ '../components/ImportDocumentModal'),
);
const DocumentAttachmentsModal = lazy(
  () =>
    import(/* webpackChunkName: "document-attachments" */ '../components/DocumentAttachmentsModal'),
);
const DocumentHistoryModal = lazy(() =>
  import('../components/DocumentHistoryModal').then((module) => ({
    default: module.DocumentHistoryModal,
  })),
);
const CommandPalette = lazy(() =>
  import(/* webpackChunkName: "command-palette" */ '../components/CommandPalette').then(
    (module) => ({
      default: module.CommandPalette,
    }),
  ),
);

type HydratingLoader = LoaderFunction & { hydrate?: boolean };

export const loader: HydratingLoader = async ({ request }) =>
  typeof window === 'undefined' ? emptyDocsRouteData(request) : loadDocsRouteData(request);
loader.hydrate = true;

function parsePublicId(value: string | null | undefined): PublicId | null {
  return isPublicId(value) ? value : null;
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.contentText.trim().slice(0, 140),
    folderId: document.folderId,
    favorite: document.favorite,
    pinned: document.pinned,
    lastViewedAt: document.lastViewedAt,
    shareId: document.shareId,
    sharedAt: document.sharedAt,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    deletedAt: document.deletedAt,
  };
}

function sortDocumentSummaries(items: DocumentSummary[]): DocumentSummary[] {
  return [...items].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      Number(right.favorite) - Number(left.favorite) ||
      Date.parse(right.lastViewedAt ?? right.updatedAt) -
        Date.parse(left.lastViewedAt ?? left.updatedAt) ||
      right.id.localeCompare(left.id),
  );
}

function parseFolderScope(value: string | null): FolderScope {
  if (value === 'unfiled') return 'unfiled';
  return isPublicId(value) ? value : 'all';
}

function docsRoute(id: PublicId | null, search: URLSearchParams) {
  const query = search.toString();
  return {
    pathname: id ? `/docs/${id}` : '/docs',
    search: query ? `?${query}` : '',
  };
}

type FolderDialogState = { folder: FolderSummary } | null;

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

function safeExportFilename(title: string, extension: string): string {
  const filename = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 80);
  return `${filename || '无标题文档'}.${extension}`;
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

function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function standaloneHtml(title: string, body: string): string {
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    body { max-width: 760px; margin: 56px auto; padding: 0 24px; color: #172332; font: 16px/1.8 ui-sans-serif, system-ui, sans-serif; }
    h1, h2, h3 { line-height: 1.3; }
    pre { overflow: auto; padding: 16px; border-radius: 10px; background: #f4f6f8; }
    blockquote { margin-left: 0; padding-left: 18px; border-left: 3px solid #d9e1ea; color: #5f6b78; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${body}
</body>
</html>
`;
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

export default function DocsPage() {
  return (
    <App>
      <DocsPageContent />
    </App>
  );
}

function DocsPageContent() {
  const { message, modal, notification } = App.useApp();
  const { status, markUnauthenticated } = useAuth();
  const loaderData = useLoaderData() as DocsRouteData | undefined;
  const revalidator = useRevalidator();
  const { user, bindProvider, openPasswordSettings, signOut } =
    useOutletContext<WorkspaceOutletContext>();
  const { documentId } = useParams<{ documentId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const view: DocumentView = parseDocumentView(searchParams.get('view'));
  const activeId = view !== 'trash' ? parsePublicId(documentId) : null;
  const folderScope = parseFolderScope(searchParams.get('folder'));
  const searchQuery = searchParams.get('q')?.trim() ?? '';
  const authUnavailable = status === 'unauthenticated';

  const [documents, setDocuments] = useState<DocumentSummary[]>(loaderData?.documents ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(loaderData?.nextCursor ?? null);
  const [folders, setFolders] = useState<FolderSummary[]>(loaderData?.folders ?? []);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<PublicId>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [documentMode, setDocumentMode] = useState<DocumentMode>('read');
  const [listLoading, setListLoading] = useState(!loaderData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const [editorLoading, setEditorLoading] = useState(false);
  const [showDocumentLoading, setShowDocumentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<PublicId | null>(null);
  const [purgingId, setPurgingId] = useState<PublicId | null>(null);
  const [moving, setMoving] = useState(false);
  const [restoringId, setRestoringId] = useState<PublicId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<PublicId | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [documentInfoOpen, setDocumentInfoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const activeDocumentRef = useRef<DocumentRecord | null>(null);
  const activeIdRef = useRef<PublicId | null>(activeId);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef('');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveDocumentRef = useRef<() => Promise<boolean>>(async () => false);
  const navigateRef = useRef(navigate);
  const createdDocumentIdRef = useRef<PublicId | null>(null);
  const documentModesRef = useRef(new Map<PublicId, DocumentMode>());
  const listIdentityRef = useRef<string | null>(null);

  activeIdRef.current = activeId;
  navigateRef.current = navigate;
  const listIdentity = `${view}:${folderScope}:${searchQuery}`;

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const refreshWorkspace = useCallback(() => {
    void revalidator.revalidate();
  }, [revalidator]);

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
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedDocumentIds((current) => (current.size === 0 ? current : new Set()));
  }, [folderScope, listRevision, searchQuery, view]);

  useEffect(() => {
    const availableIds = new Set(documents.map((document) => document.id));
    setSelectedDocumentIds((current) => {
      if ([...current].every((id) => availableIds.has(id))) return current;
      return new Set([...current].filter((id) => availableIds.has(id)));
    });
  }, [documents]);

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === searchQuery) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (normalized) next.set('q', normalized);
      else next.delete('q');
      next.delete('id');
      setListLoading(true);
      navigate(docsRoute(null, next), { replace: true });
    }, 240);

    return () => window.clearTimeout(timer);
  }, [navigate, searchInput, searchParams, searchQuery]);

  useEffect(() => {
    if (!loaderData) return;
    if (loaderData.unauthorized) {
      markUnauthenticated();
      return;
    }

    setFolders(loaderData.folders);
    if (listIdentityRef.current !== listIdentity) {
      listIdentityRef.current = listIdentity;
      setDocuments(loaderData.documents);
      setNextCursor(loaderData.nextCursor);
    } else {
      setDocuments((current) => {
        if (current.length <= loaderData.documents.length) return loaderData.documents;
        const freshIds = new Set(loaderData.documents.map((document) => document.id));
        return [
          ...loaderData.documents,
          ...current.filter((document) => !freshIds.has(document.id)),
        ];
      });
      setNextCursor((current) => (loaderData.nextCursor === null ? null : current));
    }
    setListLoading(false);
    setLoadError(loaderData.error);

    if (loaderData.view === 'trash' || searchQuery || loaderData.activeId) return;
    const firstDocument = loaderData.documents[0];
    if (!firstDocument) return;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    navigateRef.current(docsRoute(firstDocument.id, next), { replace: true });
  }, [listIdentity, loaderData, markUnauthenticated, navigate, searchParams, searchQuery]);

  const loadMoreDocuments = async () => {
    if (!nextCursor || listLoading || loadingMore) return;

    setLoadingMore(true);
    try {
      const folderId =
        folderScope === 'all' ? undefined : folderScope === 'unfiled' ? null : folderScope;
      const response =
        view === 'trash'
          ? await api.listTrashDocuments({ cursor: nextCursor })
          : await api.listDocuments({
              folderId: view === 'documents' ? folderId : undefined,
              query: searchQuery,
              favoriteOnly: view === 'favorites',
              recentOnly: view === 'recent',
              cursor: nextCursor,
            });

      setDocuments((current) => {
        const existingIds = new Set(current.map((document) => document.id));
        return [...current, ...response.items.filter((document) => !existingIds.has(document.id))];
      });
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      setLoadError(errorMessage(error, '更多文档加载失败'));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    clearSaveTimer();
    setDocumentInfoOpen(false);
    setHistoryOpen(false);
    setAttachmentsOpen(false);
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

    setEditorLoading(true);
    setLoadError(null);
  }, [activeId, authUnavailable, clearSaveTimer, editor, view]);

  useEffect(() => {
    if (!loaderData) return;
    if (loaderData.unauthorized) {
      markUnauthenticated();
      return;
    }
    if (loaderData.error) {
      setEditorLoading(false);
      if (loaderData.activeId === activeId) {
        activeDocumentRef.current = null;
        setActiveDocument(null);
        setLoadError(loaderData.error);
      }
      return;
    }
    if (view === 'trash' || !activeId) {
      setEditorLoading(false);
      return;
    }

    const document = loaderData.document;
    if (!document || document.id !== activeId) return;

    const current = activeDocumentRef.current;
    const hasUnsavedChanges =
      current?.id === document.id &&
      (revisionRef.current > savedRevisionRef.current || savePromiseRef.current !== null);
    setEditorLoading(false);
    if (hasUnsavedChanges) return;

    activeDocumentRef.current = document;
    setActiveDocument(document);
    titleRef.current = document.title;
    revisionRef.current = 0;
    savedRevisionRef.current = 0;
    setSaveState('idle');
    editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
    if (createdDocumentIdRef.current === activeId) {
      createdDocumentIdRef.current = null;
    }
  }, [activeId, editor, loaderData, markUnauthenticated, view]);

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

  const selectDocument = async (id: PublicId) => {
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
    if (view === 'documents') next.delete('view');
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
      const folderId = folderScope === 'all' || folderScope === 'unfiled' ? null : folderScope;
      const document = await api.createDocument('无标题文档', folderId);
      createdDocumentIdRef.current = document.id;
      documentModesRef.current.set(document.id, 'edit');
      setDocuments((items) => [toSummary(document), ...items]);
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      navigate(docsRoute(document.id, next));
      window.setTimeout(refreshWorkspace, 0);
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

  const importDocument = async (input: DocumentImportInput) => {
    if (creating || saveState === 'conflict') return;
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) throw new Error('当前文档保存失败，请重试后再导入');
    }

    setCreating(true);
    try {
      const folderId = folderScope === 'all' || folderScope === 'unfiled' ? null : folderScope;
      const document = await api.importDocument({ ...input, folderId });
      documentModesRef.current.set(document.id, 'edit');
      setDocuments((items) => [toSummary(document), ...items]);
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      navigate(docsRoute(document.id, next));
      window.setTimeout(refreshWorkspace, 0);
      setSearchInput('');
      message.success('文档已导入');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      throw error;
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

      if (isActive) {
        activeIdRef.current = remaining[0]?.id ?? null;
        activeDocumentRef.current = null;
        setActiveDocument(null);

        const next = new URLSearchParams(searchParams);
        next.delete('id');
        navigate(docsRoute(remaining[0]?.id ?? null, next), { replace: true });
      }
      window.setTimeout(refreshWorkspace, 0);
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

  const duplicateDocument = async () => {
    const source = activeDocumentRef.current;
    if (!source || saveState === 'conflict') return;
    const saved = await savePendingChanges();
    if (!saved) {
      message.error('当前文档保存失败，请重试后再创建副本');
      return;
    }

    try {
      const duplicate = await api.duplicateDocument(source.id);
      createdDocumentIdRef.current = duplicate.id;
      documentModesRef.current.set(duplicate.id, 'edit');
      setDocuments((items) => [toSummary(duplicate), ...items]);

      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      if (duplicate.folderId) next.set('folder', duplicate.folderId);
      else next.delete('folder');
      navigate(docsRoute(duplicate.id, next));
      window.setTimeout(refreshWorkspace, 0);
      setSearchInput('');
      message.success('副本已创建');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '创建副本失败'));
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

  const clearDocumentSelection = () => {
    setSelectionMode(false);
    setSelectedDocumentIds(new Set());
  };

  const toggleSelectionMode = () => {
    if (batchBusy) return;
    if (selectionMode) {
      clearDocumentSelection();
      return;
    }
    setSelectedDocumentIds(new Set());
    setSelectionMode(true);
  };

  const toggleDocumentSelection = (id: PublicId) => {
    if (batchBusy) return;
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDocuments = (selected: boolean) => {
    if (batchBusy) return;
    setSelectedDocumentIds(
      selected ? new Set(documents.map((document) => document.id)) : new Set(),
    );
  };

  const matchesCurrentDocumentList = (document: DocumentSummary) => {
    if (view === 'favorites') return document.favorite;
    if (view !== 'documents') return true;
    if (folderScope === 'unfiled') return document.folderId === null;
    if (isPublicId(folderScope)) return document.folderId === folderScope;
    return true;
  };

  const applyBatchDocumentResult = (
    items: DocumentSummary[],
    removedIds: ReadonlySet<PublicId> = new Set(),
  ) => {
    const updates = new Map(items.map((item) => [item.id, item]));
    const nextDocuments = sortDocumentSummaries(
      documents
        .filter((document) => !removedIds.has(document.id))
        .map((document) => updates.get(document.id) ?? document)
        .filter(matchesCurrentDocumentList),
    );
    setDocuments(nextDocuments);

    const current = activeDocumentRef.current;
    if (!current) return;
    const currentSummary = updates.get(current.id);
    const currentRemains = nextDocuments.some((document) => document.id === current.id);

    if (currentSummary && currentRemains) {
      const updated = { ...current, ...currentSummary };
      activeDocumentRef.current = updated;
      setActiveDocument(updated);
      return;
    }

    if (currentRemains) return;
    const nextActiveId = searchQuery ? null : (nextDocuments[0]?.id ?? null);
    activeIdRef.current = nextActiveId;
    activeDocumentRef.current = null;
    setActiveDocument(null);

    const next = new URLSearchParams(searchParams);
    next.delete('id');
    navigateRef.current(docsRoute(nextActiveId, next), { replace: true });
  };

  const prepareBatchOperation = async (ids: PublicId[]): Promise<boolean> => {
    const currentId = activeIdRef.current;
    if (!currentId || !ids.includes(currentId)) return true;
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return false;
    }

    const saved = await savePendingChanges();
    if (!saved) message.error('当前文档保存失败，请重试后再批量操作');
    return saved;
  };

  const batchMoveDocuments = async (ids: PublicId[], folderId: PublicId | null) => {
    if (batchBusy || ids.length === 0) return;
    setBatchBusy(true);
    try {
      if (!(await prepareBatchOperation(ids))) return;
      const result = await api.batchDocuments({ ids, action: 'move', folderId });
      applyBatchDocumentResult(result.items);
      refreshWorkspace();
      clearDocumentSelection();
      message.success(
        folderId === null
          ? `已将 ${result.updatedCount} 篇文档移到未归档`
          : `已移动 ${result.updatedCount} 篇文档`,
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '批量移动失败'));
    } finally {
      setBatchBusy(false);
    }
  };

  const batchFavoriteDocuments = async (ids: PublicId[], favorite: boolean) => {
    if (batchBusy || ids.length === 0) return;
    setBatchBusy(true);
    try {
      if (!(await prepareBatchOperation(ids))) return;
      const result = await api.batchDocuments({ ids, action: 'favorite', favorite });
      applyBatchDocumentResult(result.items);
      clearDocumentSelection();
      message.success(
        favorite
          ? `已收藏 ${result.updatedCount} 篇文档`
          : `已取消收藏 ${result.updatedCount} 篇文档`,
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, favorite ? '批量收藏失败' : '批量取消收藏失败'));
    } finally {
      setBatchBusy(false);
    }
  };

  const batchExportDocuments = async (ids: PublicId[]) => {
    if (batchBusy || ids.length === 0) return;
    if (ids.length > 50) {
      message.warning('一次最多导出 50 篇文档');
      return;
    }

    setBatchBusy(true);
    const hideLoading = message.loading(`正在导出 ${ids.length} 篇文档...`, 0);
    try {
      const { downloadDocumentBundle } = await import(
        /* webpackChunkName: "batch-export" */ '../batch-export'
      );
      const count = await downloadDocumentBundle(ids, api.getDocument);
      message.success(`已导出 ${count} 篇文档`);
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '批量导出失败'));
    } finally {
      hideLoading();
      setBatchBusy(false);
    }
  };

  const restoreBatchDocuments = async (ids: PublicId[]) => {
    if (batchBusy || ids.length === 0) return;
    setBatchBusy(true);
    try {
      const result = await api.batchDocuments({ ids, action: 'restore' });
      refreshWorkspace();
      setListRevision((value) => value + 1);
      message.success(`已恢复 ${result.updatedCount} 篇文档`);
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '撤销删除失败'));
    } finally {
      setBatchBusy(false);
    }
  };

  const batchDeleteDocuments = async (ids: PublicId[]) => {
    if (batchBusy || ids.length === 0) return;
    setBatchBusy(true);
    try {
      if (!(await prepareBatchOperation(ids))) return;
      const result = await api.batchDocuments({ ids, action: 'delete' });
      applyBatchDocumentResult([], new Set(ids));
      refreshWorkspace();
      clearDocumentSelection();

      if (result.updatedCount === 0) {
        message.info('所选文档已不在当前列表中');
        return;
      }

      const notificationKey = `batch-delete-${Date.now()}`;
      notification.info({
        key: notificationKey,
        message: `已将 ${result.updatedCount} 篇文档移入回收站`,
        description: '可以在通知消失前撤销。',
        duration: 8,
        btn: (
          <Button
            size="small"
            onClick={() => {
              notification.destroy(notificationKey);
              void restoreBatchDocuments(ids);
            }}
          >
            撤销
          </Button>
        ),
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '批量删除失败'));
    } finally {
      setBatchBusy(false);
    }
  };

  const requestBatchDelete = (ids: PublicId[]) => {
    if (batchBusy || ids.length === 0) return;
    modal.confirm({
      title: `将 ${ids.length} 篇文档移入回收站？`,
      content: '删除后仍可在通知中撤销，或稍后从回收站恢复。',
      okText: '移入回收站',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => batchDeleteDocuments(ids),
    });
  };

  const createCheckpoint = async () => {
    const document = activeDocumentRef.current;
    if (!document) throw new Error('没有打开的文档');
    const saved = await savePendingChanges();
    if (!saved) throw new Error('当前内容保存失败，请重试');
    await api.createDocumentCheckpoint(document.id);
  };

  const restoreVersion = async (version: number) => {
    const document = activeDocumentRef.current;
    if (!document) throw new Error('没有打开的文档');
    const saved = await savePendingChanges();
    if (!saved) throw new Error('当前内容保存失败，请重试');

    const latest = activeDocumentRef.current;
    if (!latest) throw new Error('没有打开的文档');
    const restored = await api.restoreDocumentVersion(latest.id, version, latest.version);
    if (activeIdRef.current === restored.id) {
      activeDocumentRef.current = restored;
      setActiveDocument(restored);
      titleRef.current = restored.title;
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setSaveState('idle');
      editor?.commands.setContent(restored.content as JSONContent, { emitUpdate: false });
      setDocuments((items) =>
        items.map((item) => (item.id === restored.id ? toSummary(restored) : item)),
      );
    }
  };

  const copyShareLink = async (shareId: PublicId) => {
    const url = new URL(window.location.origin);
    url.pathname = `/share/${shareId}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      message.success('只读分享链接已复制');
    } catch {
      message.error('复制分享链接失败，请检查浏览器权限');
    }
  };

  const updateSharedDocument = (updated: DocumentRecord) => {
    if (activeDocumentRef.current?.id === updated.id) {
      activeDocumentRef.current = updated;
      setActiveDocument(updated);
    }
    setDocuments((items) =>
      items.map((item) => (item.id === updated.id ? toSummary(updated) : item)),
    );
  };

  const createShareLink = async () => {
    const document = activeDocumentRef.current;
    if (!document || saveState === 'conflict') return;
    const saved = await savePendingChanges();
    if (!saved) {
      message.error('当前文档保存失败，请重试后再分享');
      return;
    }

    try {
      const updated = await api.setDocumentSharing(document.id, true);
      updateSharedDocument(updated);
      if (updated.shareId) await copyShareLink(updated.shareId);
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '创建分享链接失败'));
    }
  };

  const revokeShareLink = () => {
    const document = activeDocumentRef.current;
    if (!document?.shareId) return;
    modal.confirm({
      title: '停止分享这篇文档？',
      content: '现有链接会立即失效。再次分享时会生成一个新链接。',
      okText: '停止分享',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const updated = await api.setDocumentSharing(document.id, false);
          updateSharedDocument(updated);
          message.success('已停止分享');
        } catch (error) {
          if (isUnauthorized(error)) {
            markUnauthenticated();
            return;
          }
          message.error(errorMessage(error, '停止分享失败'));
        }
      },
    });
  };

  const documentActionItems: MenuProps['items'] = [
    {
      key: 'pin',
      label: activeDocument?.pinned ? '取消置顶' : '置顶文档',
      icon: (
        <Pin
          aria-hidden="true"
          size={15}
          strokeWidth={1.8}
          fill={activeDocument?.pinned ? 'currentColor' : 'none'}
        />
      ),
    },
    {
      key: 'favorite',
      label: activeDocument?.favorite ? '取消收藏' : '收藏文档',
      icon: (
        <Star
          aria-hidden="true"
          size={15}
          strokeWidth={1.8}
          fill={activeDocument?.favorite ? 'currentColor' : 'none'}
        />
      ),
    },
    {
      key: 'copy-link',
      label: '复制文档链接',
      icon: <Link2 aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    ...(activeDocument?.shareId
      ? [
          {
            key: 'copy-share',
            label: '复制只读分享链接',
            icon: <Share2 aria-hidden="true" size={15} strokeWidth={1.8} />,
          },
          {
            key: 'revoke-share',
            label: '停止分享',
            icon: <Link2Off aria-hidden="true" size={15} strokeWidth={1.8} />,
          },
        ]
      : [
          {
            key: 'create-share',
            label: '创建只读分享',
            icon: <Share2 aria-hidden="true" size={15} strokeWidth={1.8} />,
          },
        ]),
    {
      key: 'copy-markdown',
      label: '复制 Markdown',
      icon: <ClipboardCopy aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'export-markdown',
      label: '导出 Markdown',
      icon: <FileDown aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'export-html',
      label: '导出 HTML',
    },
    {
      key: 'export-json',
      label: '导出 JSON',
    },
    { type: 'divider' },
    {
      key: 'info',
      label: '文档信息',
      icon: <Info aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'attachments',
      label: '附件',
    },
    {
      key: 'history',
      label: '版本历史',
      icon: <Clock3 aria-hidden="true" size={15} strokeWidth={1.8} />,
    },
    {
      key: 'duplicate',
      label: '创建副本',
      icon: <Copy aria-hidden="true" size={15} strokeWidth={1.8} />,
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

    if (key === 'pin') {
      void togglePinned(activeDocument);
      return;
    }

    if (key === 'favorite') {
      void toggleFavorite(activeDocument);
      return;
    }

    if (key === 'create-share') {
      void createShareLink();
      return;
    }

    if (key === 'copy-share' && activeDocument.shareId) {
      void copyShareLink(activeDocument.shareId);
      return;
    }

    if (key === 'revoke-share') {
      revokeShareLink();
      return;
    }

    if (key === 'copy-markdown' || key === 'export-markdown') {
      const hideLoading = message.loading('正在生成 Markdown...', 0);
      try {
        const title = titleRef.current.trim() || activeDocument.title;
        const markdown = await editorMarkdown(editor, title);
        if (key === 'copy-markdown') {
          await navigator.clipboard.writeText(markdown);
          message.success('Markdown 已复制');
        } else {
          downloadFile(markdown, safeExportFilename(title, 'md'), 'text/markdown;charset=utf-8');
          message.success('Markdown 已下载');
        }
      } catch {
        message.error('生成 Markdown 失败');
      } finally {
        hideLoading();
      }
      return;
    }

    if (key === 'export-html') {
      const title = titleRef.current.trim() || activeDocument.title;
      downloadFile(
        standaloneHtml(title, editor.getHTML()),
        safeExportFilename(title, 'html'),
        'text/html;charset=utf-8',
      );
      message.success('HTML 已下载');
      return;
    }

    if (key === 'export-json') {
      const title = titleRef.current.trim() || activeDocument.title;
      const exported = {
        format: 'yuyan-document',
        version: 1,
        document: {
          title,
          content: editor.getJSON(),
          contentHtml: editor.getHTML(),
          contentText: editor.getText(),
        },
      };
      downloadFile(
        `${JSON.stringify(exported, null, 2)}\n`,
        safeExportFilename(title, 'json'),
        'application/json;charset=utf-8',
      );
      message.success('JSON 已下载');
      return;
    }

    if (key === 'info') {
      setDocumentInfoOpen(true);
      return;
    }

    if (key === 'attachments') {
      setAttachmentsOpen(true);
      return;
    }

    if (key === 'history') {
      setHistoryOpen(true);
      return;
    }

    if (key === 'duplicate') {
      void duplicateDocument();
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
      refreshWorkspace();
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

  const permanentlyDeleteDocument = async (document: DocumentSummary) => {
    if (purgingId !== null) return;
    setPurgingId(document.id);
    try {
      const result = await api.permanentlyDeleteDocument(document.id);
      setDocuments((items) => items.filter((item) => item.id !== document.id));
      refreshWorkspace();
      message.success(
        result.deletedAttachmentCount > 0
          ? `文档已永久删除，同时清理 ${result.deletedAttachmentCount} 个附件`
          : '文档已永久删除',
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '永久删除失败'));
    } finally {
      setPurgingId(null);
    }
  };

  const requestPermanentDelete = (document: DocumentSummary) => {
    if (purgingId !== null) return;
    modal.confirm({
      title: '永久删除这篇文档？',
      content: `“${document.title}”及其历史版本、附件都会被删除，无法恢复。`,
      okText: '永久删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => permanentlyDeleteDocument(document),
    });
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

  const navigateFromCommandPalette = async (path: string) => {
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
    setCommandPaletteOpen(false);
    navigate(path);
  };

  const openCreateFolder = (parentId: PublicId | null = null) => {
    setFolderDialog(null);
    setFolderName('');
    setCreatingFolderParentId(parentId);
    setCreatingFolder(true);
  };

  const cancelCreateFolder = () => {
    if (folderSaving) return;
    setCreatingFolder(false);
    setCreatingFolderParentId(null);
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
      const folder = await api.createFolder(name, creatingFolderParentId);
      setFolders((items) => [...items, folder]);
      setCreatingFolder(false);
      setCreatingFolderParentId(null);
      setFolderName('');
      refreshWorkspace();
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
      setFolders((items) => items.map((item) => (item.id === folder.id ? folder : item)));
      setFolderDialog(null);
      refreshWorkspace();
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
      const result = await api.deleteFolder(folder.id);
      const deletedIds = getFolderSubtreeIds(folders, folder.id);
      setFolders((items) => items.filter((item) => !deletedIds.has(item.id)));
      setFolderDialog(null);
      refreshWorkspace();
      setListRevision((value) => value + 1);
      if (folderScope !== 'all' && folderScope !== 'unfiled') {
        if (!isFolderInSubtree(folders, folderScope, folder.id)) {
          message.success(
            result.movedDocumentCount > 0 ? '文件夹已删除，文档已移到未归档' : '文件夹已删除',
          );
          return;
        }
        const next = new URLSearchParams(searchParams);
        next.delete('folder');
        next.delete('id');
        next.delete('q');
        navigate(docsRoute(null, next));
      }
      message.success(
        result.movedDocumentCount > 0
          ? '文件夹及其子文件夹已删除，文档已移到未归档'
          : '文件夹及其子文件夹已删除',
      );
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

  const moveFolder = async (folder: FolderSummary, parentId: PublicId | null) => {
    if (moving || folder.parentId === parentId) return;

    setMoving(true);
    try {
      const updated = await api.moveFolder(folder.id, parentId);
      setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      refreshWorkspace();
      message.success(parentId === null ? '文件夹已移到顶层' : '文件夹已移动');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '移动文件夹失败'));
    } finally {
      setMoving(false);
    }
  };

  const moveDocument = async (
    document: Pick<DocumentSummary, 'id' | 'folderId'>,
    folderId: PublicId | null,
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
      refreshWorkspace();
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

  const togglePinned = async (document: Pick<DocumentSummary, 'id' | 'pinned'>) => {
    try {
      const updated = await api.setDocumentPinned(document.id, !document.pinned);
      if (activeDocumentRef.current?.id === updated.id) {
        activeDocumentRef.current = updated;
        setActiveDocument(updated);
      }
      setDocuments((items) =>
        sortDocumentSummaries(
          items.map((item) => (item.id === updated.id ? toSummary(updated) : item)),
        ),
      );
      message.success(updated.pinned ? '文档已置顶' : '已取消置顶');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, document.pinned ? '取消置顶失败' : '置顶失败'));
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

  const selectedFolder =
    folderScope === 'all' || folderScope === 'unfiled'
      ? undefined
      : folders.find((folder) => folder.id === folderScope);
  const breadcrumbFolders = selectedFolder ? getFolderAncestors(folders, selectedFolder.id) : [];
  const activeFolderName =
    activeDocument?.folderId == null
      ? '未归档'
      : getFolderPathLabel(folders, activeDocument.folderId);
  const mobileLocationLabel = searchQuery
    ? `搜索：${searchQuery}`
    : (selectedFolder?.name ??
      (folderScope === 'unfiled'
        ? '未归档'
        : view === 'trash'
          ? '回收站'
          : view === 'favorites'
            ? '收藏'
            : view === 'recent'
              ? '最近浏览'
              : '全部文档'));
  const reloadingActiveDocument = editorLoading && activeDocument?.id === activeId;
  const documentLoadingVisible =
    reloadingActiveDocument || (documentPending && (!activeDocument || showDocumentLoading));

  return (
    <div className={sidebarOpen ? 'swan-workspace is-sidebar-open' : 'swan-workspace'}>
      <WorkspaceSidebar
        activeId={activeId}
        batchBusy={batchBusy}
        creating={creating}
        creatingFolder={creatingFolder}
        creatingFolderParentId={creatingFolderParentId}
        deletingDocumentId={deletingDocumentId}
        documents={documents}
        folderDraft={folderName}
        folderScope={folderScope}
        folderSaving={folderSaving}
        folders={folders}
        isOpen={sidebarOpen}
        listLoading={listLoading}
        loadingMore={loadingMore}
        hasMore={nextCursor !== null}
        purgingId={purgingId}
        restoringId={restoringId}
        saveState={saveState}
        searchValue={searchInput}
        selectionMode={selectionMode}
        selectedDocumentIds={selectedDocumentIds}
        user={user}
        view={view}
        onBindProvider={bindProvider}
        onBatchDelete={requestBatchDelete}
        onBatchExport={(ids) => void batchExportDocuments(ids)}
        onBatchFavorite={(ids, favorite) => void batchFavoriteDocuments(ids, favorite)}
        onBatchMove={(ids, folderId) => void batchMoveDocuments(ids, folderId)}
        onCancelFolderCreate={cancelCreateFolder}
        onClearSelection={clearDocumentSelection}
        onCreate={() => {
          setSidebarOpen(false);
          void createDocument();
        }}
        onCreateFolder={openCreateFolder}
        onDeleteDocument={requestDeleteDocument}
        onEditFolder={openEditFolder}
        onFolderDraftChange={setFolderName}
        onFolderSelect={selectFolder}
        onImport={() => {
          setSidebarOpen(false);
          setImportOpen(true);
        }}
        onLoadMore={() => void loadMoreDocuments()}
        onMoveDocument={(document, folderId) => void moveDocument(document, folderId)}
        onMoveFolder={(folder, parentId) => void moveFolder(folder, parentId)}
        onNavigate={() => setSidebarOpen(false)}
        onOpenPasswordSettings={openPasswordSettings}
        onPermanentlyDelete={requestPermanentDelete}
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
        onTogglePinned={(document) => void togglePinned(document)}
        onToggleDocumentSelection={toggleDocumentSelection}
        onToggleSelectAll={toggleSelectAllDocuments}
        onToggleSelectionMode={toggleSelectionMode}
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
            <button
              type="button"
              className="swan-mobile-location"
              aria-label={`打开位置菜单：${mobileLocationLabel}`}
              onClick={() => setSidebarOpen(true)}
            >
              {mobileLocationLabel}
            </button>
            <nav className="swan-editor-breadcrumb" aria-label="当前位置">
              {view === 'documents' ? (
                <>
                  <button
                    type="button"
                    className="swan-editor-breadcrumb-link"
                    onClick={() => selectFolder('all')}
                  >
                    全部文档
                  </button>
                  {folderScope === 'unfiled' && (
                    <span className="swan-editor-breadcrumb-segment">
                      <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
                      <span className="swan-editor-breadcrumb-current">未归档</span>
                    </span>
                  )}
                  {breadcrumbFolders.map((folder, index) => (
                    <span className="swan-editor-breadcrumb-segment" key={folder.id}>
                      <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
                      {index === breadcrumbFolders.length - 1 ? (
                        <OverflowText
                          text={folder.name}
                          className="swan-editor-breadcrumb-folder"
                        />
                      ) : (
                        <button
                          type="button"
                          className="swan-editor-breadcrumb-link"
                          onClick={() => selectFolder(folder.id)}
                        >
                          <OverflowText
                            text={folder.name}
                            className="swan-editor-breadcrumb-folder"
                          />
                        </button>
                      )}
                    </span>
                  ))}
                  {searchQuery && (
                    <span className="swan-editor-breadcrumb-segment">
                      <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
                      <OverflowText
                        text={`搜索：${searchQuery}`}
                        className="swan-editor-breadcrumb-current"
                      />
                    </span>
                  )}
                </>
              ) : (
                <span className="swan-editor-breadcrumb-current">
                  {view === 'trash' ? '回收站' : view === 'favorites' ? '收藏' : '最近浏览'}
                </span>
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
                  activeDocument.pinned
                    ? 'swan-document-pin-button is-active'
                    : 'swan-document-pin-button'
                }
                type="text"
                icon={
                  <Pin
                    aria-hidden="true"
                    size={16}
                    strokeWidth={1.8}
                    fill={activeDocument.pinned ? 'currentColor' : 'none'}
                  />
                }
                aria-label={activeDocument.pinned ? '取消置顶' : '置顶文档'}
                aria-pressed={activeDocument.pinned}
                onClick={() => void togglePinned(activeDocument)}
              />
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
              ) : view === 'recent' ? (
                <>
                  <strong>还没有浏览记录</strong>
                  <span>打开一篇文档后，它会出现在这里。</span>
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

      {activeDocument && historyOpen && (
        <Suspense fallback={null}>
          <DocumentHistoryModal
            documentId={activeDocument.id}
            currentVersion={activeDocument.version}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            onCreateCheckpoint={createCheckpoint}
            onRestore={restoreVersion}
          />
        </Suspense>
      )}

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            onCreateDocument={() => {
              setCommandPaletteOpen(false);
              void createDocument();
            }}
            onNavigate={(path) => void navigateFromCommandPalette(path)}
            onOpenDocument={(id) => {
              setCommandPaletteOpen(false);
              void selectDocument(id);
            }}
          />
        </Suspense>
      )}

      {importOpen && (
        <Suspense fallback={null}>
          <ImportDocumentModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onImport={importDocument}
          />
        </Suspense>
      )}

      {attachmentsOpen && (
        <Suspense fallback={null}>
          <DocumentAttachmentsModal
            documentId={activeId!}
            onClose={() => setAttachmentsOpen(false)}
          />
        </Suspense>
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
            onCreateChild={() => {
              const folder = folderDialog.folder;
              setFolderDialog(null);
              openCreateFolder(folder.id);
            }}
            onDelete={deleteFolder}
            onSubmit={() => void renameFolder()}
          />
        </Suspense>
      )}
    </div>
  );
}
