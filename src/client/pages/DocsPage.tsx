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
  useSearchParams,
  type LoaderFunction,
} from 'react-router';

import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';
import FolderDialog from '../components/FolderDialog';
import { sortDocumentSummaries } from '../document-order';
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
const isStaticRender = typeof window === 'undefined';
const EDITOR_MODE_STORAGE_KEY = 'swan:document-modes';

function loadDocumentModes(): Map<PublicId, DocumentMode> {
  if (isStaticRender) return new Map();
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(EDITOR_MODE_STORAGE_KEY) ?? '{}',
    ) as Record<string, unknown> | null;
    if (!stored || typeof stored !== 'object') return new Map();
    return new Map(
      Object.entries(stored).filter(
        (entry): entry is [PublicId, 'edit'] => isPublicId(entry[0]) && entry[1] === 'edit',
      ),
    );
  } catch {
    return new Map();
  }
}

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
type ActiveDocumentLoader = {
  listIdentity: string;
  requestId: number;
  controller: AbortController;
  promise: Promise<DocumentRecord | null>;
};
type RouteIdentity = { view: DocumentView; folderScope: FolderScope; searchQuery: string };
type SelectFolder = (scope: FolderScope) => Promise<void>;

export const loader: HydratingLoader = async ({ request }) =>
  typeof window === 'undefined' ? emptyDocsRouteData(request) : loadDocsRouteData(request);

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
  formMethod,
}: {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
  formMethod?: string;
}) {
  if (formMethod) return defaultShouldRevalidate;
  const currentPath = currentUrl.pathname.replace(/^\/docs\/[^/]+\/?$/, '/docs');
  const nextPath = nextUrl.pathname.replace(/^\/docs\/[^/]+\/?$/, '/docs');
  if (currentPath === nextPath && currentUrl.search === nextUrl.search) return false;
  return defaultShouldRevalidate;
}

function parsePublicId(value: string | null | undefined): PublicId | null {
  return isPublicId(value) ? value : null;
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.contentText.trim().slice(0, 140),
    folderId: document.folderId,
    parentId: document.parentId,
    childCount: document.childCount,
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
  const { user, bindProvider, openPasswordSettings, signOut } =
    useOutletContext<WorkspaceOutletContext>();
  const { documentId } = useParams<{ documentId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const view: DocumentView = parseDocumentView(searchParams.get('view'));
  const activeId = view !== 'trash' ? parsePublicId(documentId) : null;
  const hydratedDocumentRef = useRef<{ id: PublicId; data: DocumentRecord } | null>(null);
  const folderScope = parseFolderScope(searchParams.get('folder'));
  const searchQuery = searchParams.get('q')?.trim() ?? '';
  const authUnavailable = status === 'unauthenticated';

  const [documents, setDocuments] = useState<DocumentSummary[]>(loaderData?.documents ?? []);
  const hydratedLoaderDataRef = useRef(loaderData);
  const [nextCursor, setNextCursor] = useState<string | null>(loaderData?.nextCursor ?? null);
  const [folders, setFolders] = useState<FolderSummary[]>(loaderData?.folders ?? []);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [pendingContent, setPendingContent] = useState<JSONContent | null>(
    () => (loaderData?.document?.content as JSONContent | undefined) ?? EMPTY_CONTENT,
  );
  const pendingContentDocumentIdRef = useRef<PublicId | null>(loaderData?.document?.id ?? null);
  const [editorTitle, setEditorTitle] = useState('');
  const [documentChildren, setDocumentChildren] = useState(loaderData?.documentChildren ?? {});
  const documentChildrenRef = useRef(documentChildren);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<PublicId>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [documentMode, setDocumentMode] = useState<DocumentMode>('read');
  const [listLoading, setListLoading] = useState(!loaderData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<PublicId>>(() => new Set());
  const [editorLoading, setEditorLoading] = useState(false);
  const [showDocumentLoading, setShowDocumentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<PublicId | null>(null);
  const [purgingId, setPurgingId] = useState<PublicId | null>(null);
  const [moving, setMoving] = useState(false);
  const [restoringId, setRestoringId] = useState<PublicId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const documentsRef = useRef(documents);
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
  const activeIdRef = useRef<PublicId | null>(null);
  const loadingDocumentIdRef = useRef<PublicId | null>(null);
  const selectingDocumentRef = useRef(false);
  const activeDocumentLoaderRef = useRef<ActiveDocumentLoader | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef('');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveDocumentRef = useRef<() => Promise<boolean>>(async () => false);
  const saveDocumentIdRef = useRef<PublicId | null>(null);
  const scheduleSaveRef = useRef<() => void>(() => {});
  const markDirtyRef = useRef<() => void>(() => {});
  const saveQueuedRef = useRef(false);
  const navigateRef = useRef(navigate);
  const createdDocumentIdRef = useRef<PublicId | null>(null);
  const documentModesRef = useRef(loadDocumentModes());
  const autoOpenNavigationRef = useRef(false);
  const requestIdRef = useRef(0);
  const documentChildrenActivityRef = useRef(new Map<PublicId, number>());
  const routeIdentityRef = useRef<RouteIdentity>({ view, folderScope, searchQuery });
  const selectFolderRef = useRef<SelectFolder>(async () => {});
  const loaderDataRef = useRef(loaderData);

  activeIdRef.current = activeId;
  navigateRef.current = navigate;
  documentChildrenRef.current = documentChildren;
  documentsRef.current = documents;
  loaderDataRef.current = loaderData;
  routeIdentityRef.current = { view, folderScope, searchQuery };
  const listIdentity = `${view}:${folderScope}:${searchQuery}`;
  const patchDocumentSummaries = (updated: DocumentRecord) => {
    const summary = toSummary(updated);
    const mergeSummary = (item: DocumentSummary) => ({ ...item, ...summary });
    const nextDocuments = documentsRef.current.map((item) =>
      item.id === updated.id ? mergeSummary(item) : item,
    );
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    const nextChildren = Object.fromEntries(
      Object.entries(documentChildrenRef.current).map(([parentId, items]) => [
        parentId,
        items.map((item) => (item.id === updated.id ? mergeSummary(item) : item)),
      ]),
    );
    documentChildrenRef.current = nextChildren;
    setDocumentChildren(nextChildren);
  };

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        EDITOR_MODE_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(documentModesRef.current)),
      );
    } catch {
      // The active page still retains its edit mode when session storage is unavailable.
    }
  }, [activeId, loaderData, saveState]);

  const clearSaveTimer = () => {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };

  const refreshWorkspace = async () => {
    const data = await loadDocsRouteData(
      new Request(new URL(`/docs/${activeIdRef.current ?? ''}`, window.location.origin)),
    );
    if (data.unauthorized) {
      markUnauthenticated();
      return;
    }
    if (data.error) {
      message.error(data.error);
      return;
    }
    setFolders(data.folders);
    setDocumentChildren((current) => {
      const merged = { ...current, ...data.documentChildren };
      documentChildrenRef.current = merged;
      return merged;
    });
  };

  const applyDocument = (document: DocumentRecord, requestId?: number) => {
    if (
      requestId !== undefined &&
      (requestIdRef.current !== requestId || activeIdRef.current !== document.id)
    ) {
      return;
    }
    if (activeIdRef.current !== document.id) return;
    const current = activeDocumentRef.current;
    const hasUnsavedChanges =
      current?.id === document.id &&
      (revisionRef.current > savedRevisionRef.current ||
        saveQueuedRef.current ||
        savePromiseRef.current !== null);
    if (hasUnsavedChanges && requestId !== undefined) return;
    if (
      requestId === undefined &&
      current?.id === document.id &&
      current.version === document.version
    ) {
      return;
    }
    hydratedDocumentRef.current = { id: document.id, data: document };

    activeDocumentRef.current = document;
    activeIdRef.current = document.id;
    revisionRef.current = 0;
    savedRevisionRef.current = 0;
    if (!hasUnsavedChanges && requestId === undefined) setSaveState('idle');
    setActiveDocument(document);
    if (!hasUnsavedChanges && requestId === undefined && hydratedDocumentRef.current) {
      hydratedDocumentRef.current = { id: document.id, data: document };
    }
    titleRef.current = document.title;
    setEditorTitle(document.title);
    const openInEdit = documentModesRef.current.get(document.id) === 'edit';
    documentModesRef.current.set(document.id, openInEdit ? 'edit' : 'read');
    setDocumentMode(openInEdit ? 'edit' : 'read');
    patchDocumentSummaries(document);
    if (!hasUnsavedChanges) saveQueuedRef.current = false;
    setEditorLoading(false);
    if (!hasUnsavedChanges) {
      pendingContentDocumentIdRef.current = document.id;
      setPendingContent(document.content as JSONContent);
    }
    setDocumentChildren((current) =>
      current[document.id]
        ? current
        : {
            ...current,
            [document.id]: [],
          },
    );
  };
  const applyDocumentRef = useRef(applyDocument);
  applyDocumentRef.current = applyDocument;
  const loadActiveDocument = useCallback(
    async (id: PublicId): Promise<DocumentRecord | null> => {
      const loader = activeDocumentLoaderRef.current;
      if (loader?.requestId === requestIdRef.current && loader.listIdentity === listIdentity) {
        return loader.promise;
      }

      if (loader) loader.controller.abort();
      const controller = new AbortController();
      const requestId = requestIdRef.current;
      const promise: Promise<DocumentRecord | null> = api
        .getDocument(id, { signal: controller.signal })
        .then((document) => {
          if (
            controller.signal.aborted ||
            activeIdRef.current !== id ||
            requestId !== requestIdRef.current
          ) {
            return null;
          }
          applyDocumentRef.current(document, requestId);
          return document;
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return null;
          throw error;
        })
        .finally(() => {
          const currentLoader = activeDocumentLoaderRef.current;
          if (currentLoader?.promise === promise) {
            activeDocumentLoaderRef.current = null;
            loadingDocumentIdRef.current = null;
          }
        });
      activeDocumentLoaderRef.current = { listIdentity, requestId, controller, promise };
      return promise;
    },
    [listIdentity],
  );
  const selectDocumentCallback = async (id: PublicId) => {
    if (id === activeIdRef.current) return;
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }
    if (
      revisionRef.current > savedRevisionRef.current ||
      saveQueuedRef.current ||
      savePromiseRef.current
    ) {
      void markDirtyRef.current();
      const saved = await saveDocumentRef.current();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再切换');
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    activeDocumentLoaderRef.current?.controller.abort();
    activeIdRef.current = id;
    loadingDocumentIdRef.current = id;
    selectingDocumentRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.delete('q');
    next.delete('id');
    navigate(docsRoute(id, next));

    try {
      await loadActiveDocument(id);
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      if (requestIdRef.current === requestId) {
        activeIdRef.current = null;
        setEditorLoading(false);
        message.error(errorMessage(error, '文档加载失败'));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        loadingDocumentIdRef.current = null;
        selectingDocumentRef.current = false;
      }
    }
  };
  const selectDocument = (id: PublicId) => selectDocumentCallback(id);

  const scheduleSave = () => {
    clearSaveTimer();
    saveQueuedRef.current = true;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveDocumentRef.current();
    }, 900);
  };

  scheduleSaveRef.current = scheduleSave;

  const markDirty = () => {
    revisionRef.current += 1;
    setSaveState((current) => (current === 'saving' || current === 'conflict' ? current : 'dirty'));
    scheduleSaveRef.current();
  };
  markDirtyRef.current = markDirty;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写点什么，内容会自动保存。',
      }),
    ],
    content: pendingContent ?? EMPTY_CONTENT,
    immediatelyRender: false,
    onDestroy: () => {
      editorRef.current = null;
    },
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'swan-prosemirror',
        role: 'textbox',
        'aria-label': '文档正文',
        spellcheck: 'false',
      },
    },
    onUpdate: () => markDirty(),
  });

  editorRef.current = editor;

  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeDocument?.id !== activeId) activeDocumentRef.current = null;
  }, [activeDocument, activeId]);

  useEffect(() => {
    if (!editor || !pendingContent) return;
    editor.commands.setContent(pendingContent, { emitUpdate: false });
    pendingContentDocumentIdRef.current = null;
    setPendingContent(null);
    if (activeIdRef.current) {
      documentChildrenActivityRef.current.set(activeIdRef.current, Date.now());
    }
  }, [editor, pendingContent]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(documentMode === 'edit', false);
    editor.view.dom.setAttribute('aria-readonly', String(documentMode !== 'edit'));
  }, [documentMode, editor]);

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
      return;
    }
    setFolders(loaderData.folders);
    setDocumentChildren((current) => {
      const merged = { ...current, ...loaderData.documentChildren };
      documentChildrenRef.current = merged;
      return merged;
    });
    setDocuments(loaderData.documents);
    documentsRef.current = loaderData.documents;
    setNextCursor(loaderData.nextCursor);
    setListLoading(false);
    setLoadError(loaderData.error);
    selectingDocumentRef.current = false;

    if (hydratedLoaderDataRef.current !== loaderData) {
      hydratedLoaderDataRef.current = loaderData;
      return;
    }
    if (loaderData.view === 'trash' || searchQuery || activeId) return;
    if (loaderData.view === 'favorites' || loaderData.view === 'recent') return;
    if (view === 'favorites' || view === 'recent') return;
    if (autoOpenNavigationRef.current) return;
    const firstDocument = loaderData.documents[0];
    if (!firstDocument) return;
    autoOpenNavigationRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    navigateRef.current(docsRoute(firstDocument.id, next), { replace: true });
  }, [activeId, loaderData, markUnauthenticated, searchParams]);
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
              sort: view === 'recent' ? 'activity' : 'edited',
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

  const loadDocumentChildren = async (documentId: PublicId): Promise<DocumentSummary[]> => {
    const startedAt = Date.now();
    const { items } = await api.listDocumentTree(documentId);
    const updatedAt = documentChildrenActivityRef.current.get(documentId) ?? 0;
    if (updatedAt > startedAt) {
      const current = documentChildrenRef.current[documentId];
      if (current) return current;
    }
    const nextItems = [...items];
    const nextByParent = new Map<PublicId, DocumentSummary[]>();
    for (const item of nextItems) {
      if (!item.parentId) continue;
      const siblings = nextByParent.get(item.parentId) ?? [];
      siblings.push(item);
      nextByParent.set(item.parentId, siblings);
    }
    for (const item of items) {
      if (documentChildrenRef.current[item.id] !== undefined) {
        nextByParent.delete(item.id);
      }
    }
    const next = {
      ...documentChildrenRef.current,
      [documentId]: items.filter((item) => item.parentId === documentId),
      ...Object.fromEntries(nextByParent),
    };
    documentChildrenRef.current = next;
    setDocumentChildren(next);
    return nextItems;
  };

  const toggleDocumentExpanded = async (documentId: PublicId) => {
    if (expandedDocumentIds.has(documentId)) {
      setExpandedDocumentIds((current) => {
        const next = new Set(current);
        next.delete(documentId);
        return next;
      });
      return;
    }
    setExpandedDocumentIds((current) => new Set(current).add(documentId));
    try {
      await loadDocumentChildren(documentId);
    } catch (error) {
      setExpandedDocumentIds((current) => {
        const next = new Set(current);
        next.delete(documentId);
        return next;
      });
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '子文档加载失败'));
    }
  };

  useEffect(() => {
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
    if (activeId) setDocumentMode(openInEdit ? 'edit' : 'read');

    if (authUnavailable || view === 'trash' || !activeId) {
      clearSaveTimer();
      requestIdRef.current += 1;
      documentChildrenActivityRef.current.clear();
      if (authUnavailable) {
        documentModesRef.current.clear();
        window.sessionStorage.removeItem(EDITOR_MODE_STORAGE_KEY);
      }
      activeIdRef.current = null;
      loadingDocumentIdRef.current = null;
      selectingDocumentRef.current = false;
      activeDocumentRef.current = null;
      setActiveDocument(null);
      titleRef.current = '';
      setEditorTitle('');
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setSaveState('idle');
      setPendingContent(null);
      editor?.commands.setContent(EMPTY_CONTENT, { emitUpdate: false });
      return;
    }

    setLoadError(null);
  }, [activeId, authUnavailable, editor, view]);

  useEffect(() => {
    if (activeId || view === 'trash') return;
    if (selectingDocumentRef.current) return;
    const firstDocument = documentsRef.current[0];
    if (!firstDocument) return;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    navigate(docsRoute(firstDocument.id, next), { replace: true });
  }, [activeId, navigate, searchParams, searchQuery, view]);

  useEffect(() => {
    if (!activeId || view === 'trash') return;
    if (selectingDocumentRef.current) return;
    const hydrated = hydratedDocumentRef.current;
    if (hydrated?.id === activeId) {
      if (hydrated.data !== activeDocumentRef.current) {
        applyDocumentRef.current(hydrated.data);
      }
      return;
    }
    loadingDocumentIdRef.current = activeId;
    let cancelled = false;
    void loadActiveDocument(activeId)
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文档加载失败'));
      })
      .finally(() => {
        if (loadingDocumentIdRef.current === activeId) loadingDocumentIdRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, loadActiveDocument, markUnauthenticated, view]);

  saveDocumentRef.current = async (): Promise<boolean> => {
    const document = activeDocumentRef.current;
    const currentEditor = editorRef.current;
    const pending = savePromiseRef.current;
    if (pending) {
      if (saveDocumentIdRef.current === document?.id) return pending;
      if (!(await pending)) return false;
      return saveDocumentRef.current();
    }
    if (!document) return false;
    if (!currentEditor) return false;
    saveDocumentIdRef.current = document.id;

    const revision = revisionRef.current;
    const nextTitle = titleRef.current.trim() || '无标题文档';

    if (!titleRef.current.trim()) {
      titleRef.current = nextTitle;
    }

    clearSaveTimer();
    saveQueuedRef.current = false;
    setSaveState('saving');

    const task = (async () => {
      try {
        const savedContent = currentEditor.getJSON() as Record<string, unknown>;
        const savedContentHtml = currentEditor.getHTML();
        const savedContentText = currentEditor.getText();
        const savedTitle = titleRef.current.trim() || '无标题文档';
        const updated = await api.updateDocument(document.id, {
          version: document.version,
          title: savedTitle,
          content: savedContent,
          contentHtml: savedContentHtml,
          contentText: savedContentText,
        });

        patchDocumentSummaries(updated);

        if (activeIdRef.current === document.id) {
          const currentTitle = titleRef.current.trim() || '无标题文档';
          const current = {
            ...updated,
            title: currentTitle,
            content: savedContent,
            contentHtml: savedContentHtml,
            contentText: savedContentText,
          };
          activeDocumentRef.current = current;
          setActiveDocument(current);
          hydratedDocumentRef.current = { id: current.id, data: current };
          if (revisionRef.current > revision) {
            hydratedDocumentRef.current = { id: updated.id, data: updated };
          }
          if (titleRef.current.trim()) setEditorTitle(titleRef.current);
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
      if (savePromiseRef.current === task) {
        savePromiseRef.current = null;
        saveDocumentIdRef.current = null;
      }
    }
  };

  const saveDocument = () => saveDocumentRef.current();

  const savePendingChanges = async (): Promise<boolean> => {
    while (
      revisionRef.current > savedRevisionRef.current ||
      saveQueuedRef.current ||
      savePromiseRef.current
    ) {
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
      setEditorTitle(document.title);
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

  const createDocument = async (
    parent: Pick<DocumentSummary, 'id' | 'folderId'> | null = null,
    targetFolderId?: PublicId | null,
  ) => {
    if (creating || saveState === 'conflict') return;
    if (
      revisionRef.current > savedRevisionRef.current ||
      saveQueuedRef.current ||
      savePromiseRef.current
    ) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再新建');
        return;
      }
    }

    setCreating(true);
    try {
      const folderId = targetFolderId !== undefined ? targetFolderId : (parent?.folderId ?? null);
      const document = await api.createDocument('无标题文档', folderId, parent?.id ?? null);
      createdDocumentIdRef.current = document.id;
      documentModesRef.current.set(document.id, 'edit');
      if (parent) {
        setExpandedDocumentIds((items) => new Set(items).add(parent.id));
      }
      setDocuments((items) => {
        const additions = [toSummary(document)];
        const current = activeDocumentRef.current;
        if (folderId && !parent && current && !items.some((item) => item.id === current.id)) {
          const currentSummary = toSummary(current);
          additions.push({
            ...currentSummary,
            folderId,
            parentId: null,
            childCount: 0,
          });
        }
        const next = [
          ...additions,
          ...items.filter((item) => !additions.some(({ id }) => id === item.id)),
        ];
        documentsRef.current = next;
        return next;
      });
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('q');
      next.delete('id');
      navigate(docsRoute(document.id, next));
      setDocumentMode('edit');
      if (parent || folderId)
        setDocumentChildren((currentItems) => {
          const key = parent?.id ?? folderId;
          if (!key) return currentItems;
          const items = currentItems;
          const siblings = items[key] ?? [];
          const summary = toSummary(document);
          const updated = {
            ...items,
            [key]: [
              summary,
              ...siblings
                .filter((item) => item.id !== summary.id)
                .map((item) => ({
                  ...item,
                  childCount: item.parentId === parent?.id ? item.childCount + 1 : item.childCount,
                })),
            ],
          };
          documentChildrenRef.current = updated;
          return updated;
        });
      if (parent) {
        setDocumentChildren((items) => {
          const updated = {
            ...items,
            [parent.id]: [toSummary(document), ...(items[parent.id] ?? [])],
          };
          documentChildrenRef.current = updated;
          return updated;
        });
      }
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
      view === 'recent' ? 'activity' : 'edited',
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
          ? `已将 ${result.updatedCount} 篇文档移到根目录`
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
      createdDocumentIdRef.current = null;
      setEditorTitle(restored.title);
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setSaveState('idle');
      editor?.commands.setContent(restored.content as JSONContent, { emitUpdate: false });
      patchDocumentSummaries(restored);
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
    patchDocumentSummaries(updated);
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

    if (key === 'delete') requestDeleteDocument(activeDocument);
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
    void selectFolderRef.current(scope);
  };
  const selectFolderAsync = async (scope: FolderScope) => {
    if (
      revisionRef.current > savedRevisionRef.current ||
      saveQueuedRef.current ||
      savePromiseRef.current
    ) {
      void markDirtyRef.current();
      if (!(await saveDocumentRef.current())) {
        message.error('当前文档保存失败，请重试后再切换');
        return;
      }
    }
    const route = routeIdentityRef.current;
    const next = new URLSearchParams();
    if (scope === 'all' || scope === 'unfiled') {
      if (scope === 'unfiled') next.set('folder', 'unfiled');
    } else next.set('folder', scope);
    if (route.view === 'favorites' || route.view === 'recent') next.set('view', route.view);
    if (route.searchQuery) next.set('q', route.searchQuery);

    let nextId = activeIdRef.current;
    if (nextId && route.view !== 'trash') {
      const current = documentsRef.current.find((document) => document.id === nextId);
      if (
        current &&
        ((scope === 'unfiled'
          ? current.folderId !== null
          : scope !== 'all' && current.folderId !== scope) ||
          !loaderDataRef.current?.documents.some(
            (document) =>
              document.id !== nextId ||
              !(scope === 'unfiled'
                ? document.folderId === null
                : scope === 'all' || document.folderId === scope),
          ))
      ) {
        nextId = null;
      }
    }
    if (nextId === activeIdRef.current) nextId = null;
    setSidebarOpen(false);
    setCreatingFolder(false);
    setSearchInput('');
    navigate(docsRoute(nextId, next));
  };
  selectFolderRef.current = selectFolderAsync;

  const savePendingForCommandPalette = async () => {
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return false;
    }
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再切换');
        return false;
      }
    }
    return true;
  };

  const navigateFromCommandPalette = async (path: string) => {
    if (!(await savePendingForCommandPalette())) return;
    setCommandPaletteOpen(false);
    navigate(path);
  };

  const createFromCommandPalette = async () => {
    setCommandPaletteOpen(false);
    if (await savePendingForCommandPalette()) await createDocument();
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

  const requestDeleteFolder = (folder: FolderSummary) => {
    if (folderDeleting) return;
    modal.confirm({
      title: `删除“${folder.name}”？`,
      content: '分组及其下属分组会被删除，里面的文档会保留并移到根目录。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteFolder(folder),
    });
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
      message.success('分组已创建');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '分组保存失败'));
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
      message.success('分组已重命名');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '分组保存失败'));
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async (folder: FolderSummary) => {
    if (folderDeleting) return;
    setFolderDeleting(true);
    try {
      const result = await api.deleteFolder(folder.id);
      const deletedIds = getFolderSubtreeIds(folders, folder.id);
      setFolders((items) => items.filter((item) => !deletedIds.has(item.id)));
      refreshWorkspace();
      setListRevision((value) => value + 1);
      if (folderScope !== 'all' && folderScope !== 'unfiled') {
        if (!isFolderInSubtree(folders, folderScope, folder.id)) {
          message.success(
            result.movedDocumentCount > 0 ? '分组已删除，文档已移到根目录' : '分组已删除',
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
          ? '分组及其下属分组已删除，文档已移到根目录'
          : '分组及其下属分组已删除',
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '分组删除失败'));
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
      message.success(parentId === null ? '分组已移到顶层' : '分组已移动');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '移动分组失败'));
    } finally {
      setMoving(false);
    }
  };

  const moveDocument = async (
    document: Pick<DocumentSummary, 'id' | 'folderId'>,
    folderId: PublicId | null,
    parentId: PublicId | null = null,
  ) => {
    if (moving) return;
    if (
      document.folderId === folderId &&
      'parentId' in document &&
      document.parentId === parentId
    ) {
      return;
    }

    setMoving(true);
    try {
      const updated = await api.moveDocument(document.id, folderId, parentId);
      if (activeDocumentRef.current?.id === updated.id) {
        activeDocumentRef.current = updated;
        setActiveDocument(updated);
      }
      patchDocumentSummaries(updated);
      refreshWorkspace();
      setListRevision((value) => value + 1);
      if (updated.parentId) {
        void loadDocumentChildren(updated.parentId);
      }
      message.success(folderId === null ? '文档已移到根目录' : '文档已移动');
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
      if (view === 'favorites' && !updated.favorite) {
        setDocuments((items) => {
          const next = items.filter((item) => item.id !== updated.id);
          documentsRef.current = next;
          return next;
        });
      } else {
        patchDocumentSummaries(updated);
      }
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
      patchDocumentSummaries(updated);
      message.success(updated.pinned ? '文档已置顶' : '已取消置顶');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, document.pinned ? '取消置顶失败' : '置顶失败'));
    }
  };

  const handleTitleChange = (value: string) => {
    titleRef.current = value;
    setEditorTitle(value);
    const title = value.trim() || '无标题文档';
    const nextDocuments = documentsRef.current.map((document) =>
      document.id === activeIdRef.current ? { ...document, title } : document,
    );
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    const nextChildren = Object.fromEntries(
      Object.entries(documentChildrenRef.current).map(([parentId, items]) => [
        parentId,
        items.map((item) => (item.id === activeIdRef.current ? { ...item, title } : item)),
      ]),
    );
    documentChildrenRef.current = nextChildren;
    setDocumentChildren(nextChildren);
    const current = activeDocumentRef.current;
    if (current) {
      const next = { ...current, title: value.trim() || '无标题文档' };
      activeDocumentRef.current = next;
      setActiveDocument(next);
    }
    markDirtyRef.current();
  };

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
    (pendingContentDocumentIdRef.current !== null && activeId !== null
      ? pendingContentDocumentIdRef.current !== activeId
      : activeId === null
        ? activeDocument !== null || (!searchQuery && (listLoading || documents.length > 0))
        : activeDocument?.id !== activeId);

  if (isStaticRender) return <HydrateFallback />;

  useEffect(() => {
    if (!documentPending || activeDocument !== null) {
      setShowDocumentLoading(false);
      return;
    }

    const timer = window.setTimeout(() => setShowDocumentLoading(true), 80);
    return () => window.clearTimeout(timer);
  }, [activeDocument, documentPending]);

  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (!user) return <HydrateFallback />;

  const selectedFolder =
    folderScope === 'all' || folderScope === 'unfiled'
      ? undefined
      : folders.find((folder) => folder.id === folderScope);
  const breadcrumbFolders = selectedFolder ? getFolderAncestors(folders, selectedFolder.id) : [];
  const activeFolderName =
    activeDocument?.folderId == null
      ? '根目录'
      : getFolderPathLabel(folders, activeDocument.folderId);
  const mobileLocationLabel = searchQuery
    ? `搜索：${searchQuery}`
    : (selectedFolder?.name ??
      (folderScope === 'unfiled'
        ? '根目录'
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
        documentChildren={documentChildren}
        expandedDocumentIds={expandedDocumentIds}
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
        onCreateChildDocument={(parent) => {
          setSidebarOpen(false);
          void createDocument(parent);
        }}
        onCreateFolder={openCreateFolder}
        onDeleteDocument={requestDeleteDocument}
        onDeleteFolder={requestDeleteFolder}
        onEditFolder={openEditFolder}
        onFolderCreateDocument={(folder) => {
          setSidebarOpen(false);
          void createDocument(null, folder.id);
        }}
        onFolderDraftChange={setFolderName}
        onImport={() => {
          setSidebarOpen(false);
          setImportOpen(true);
        }}
        onLoadMore={() => void loadMoreDocuments()}
        onMoveDocument={(document, folderId) => void moveDocument(document, folderId)}
        onMoveDocumentToParent={(document, folderId, parentId) =>
          void moveDocument(document, folderId, parentId)
        }
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
        onToggleDocumentExpanded={(id) => void toggleDocumentExpanded(id)}
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
                      <span className="swan-editor-breadcrumb-current">根目录</span>
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
                  value={editorTitle}
                  mode={documentMode}
                  autoFocus={createdDocumentIdRef.current === activeDocument.id}
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
            onCreateDocument={() => void createFromCommandPalette()}
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
        <FolderDialog
          key={`rename-${folderDialog.folder.id}`}
          name={folderName}
          saving={folderSaving}
          onChange={setFolderName}
          onClose={() => {
            if (!folderSaving) setFolderDialog(null);
          }}
          onSubmit={() => void renameFolder()}
        />
      )}
    </div>
  );
}
