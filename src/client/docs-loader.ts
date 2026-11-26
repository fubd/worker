import { isPublicId, type PublicId } from '@/shared/ids';
import type {
  DocumentChildrenResponse,
  DocumentRecord,
  DocumentSummary,
  FolderSummary,
} from '@/shared/types';
import { api, ApiError } from './api/client';
import { parseDocumentView, type DocumentView, type FolderScope } from './workspace-utils';

export interface DocsRouteData {
  activeId: PublicId | null;
  document: DocumentRecord | null;
  documentChildren: Record<PublicId, DocumentSummary[]>;
  documents: DocumentSummary[];
  error: string | null;
  folders: FolderSummary[];
  nextCursor: string | null;
  unauthorized: boolean;
  view: DocumentView;
}

function parseFolderScope(value: string | null): FolderScope {
  if (value === 'unfiled') return 'unfiled';
  return isPublicId(value) ? value : 'all';
}

function parseActiveId(pathname: string, view: DocumentView): PublicId | null {
  if (view === 'trash') return null;
  const match = pathname.match(/^\/docs\/([^/]+)\/?$/);
  return match && isPublicId(match[1]) ? match[1] : null;
}

export function emptyDocsRouteData(request: Request): DocsRouteData {
  const url = new URL(request.url);
  const view = parseDocumentView(url.searchParams.get('view'));
  return {
    activeId: parseActiveId(url.pathname, view),
    document: null,
    documentChildren: {},
    documents: [],
    error: null,
    folders: [],
    nextCursor: null,
    unauthorized: false,
    view,
  };
}

function buildDocumentChildren(documents: DocumentSummary[]): Record<PublicId, DocumentSummary[]> {
  const children = new Map<PublicId, DocumentSummary[]>();
  for (const document of documents) {
    if (!document.parentId) continue;
    if (!children.has(document.parentId)) children.set(document.parentId, []);
    children.get(document.parentId)!.push(document);
  }
  return Object.fromEntries(children);
}

function buildDocumentTree(items: DocumentSummary[]): Record<PublicId, DocumentSummary[]> {
  const descendants = new Map<PublicId, DocumentSummary[]>();
  const parentIds = new Set(items.map((item) => item.parentId).filter((id) => id !== null));
  for (const parentId of parentIds) {
    descendants.set(
      parentId,
      items.filter((item) => item.parentId === parentId),
    );
  }
  return Object.fromEntries(descendants);
}

export async function loadDocsRouteData(request: Request): Promise<DocsRouteData> {
  const url = new URL(request.url);
  const routeView = parseDocumentView(url.searchParams.get('view'));
  const folderScope = parseFolderScope(url.searchParams.get('folder'));
  const searchQuery = url.searchParams.get('q')?.trim() ?? '';
  const activeId = parseActiveId(url.pathname, routeView);
  const folderId =
    folderScope === 'all' ? undefined : folderScope === 'unfiled' ? null : folderScope;

  try {
    const [folderResponse, listResponse, document] = await Promise.all([
      api.listFolders(),
      routeView === 'trash'
        ? api.listTrashDocuments()
        : typeof window === 'undefined'
          ? Promise.resolve({ items: [], nextCursor: null })
          : api.listDocuments({
              folderId: routeView === 'documents' ? folderId : undefined,
              query: searchQuery,
              favoriteOnly: routeView === 'favorites',
              recentOnly: routeView === 'recent',
              sort: routeView === 'recent' ? 'activity' : 'edited',
            }),
      activeId ? api.getDocument(activeId) : Promise.resolve(null),
    ]);
    let documentChildren = buildDocumentChildren(listResponse.items);
    if (routeView === 'documents' && document && document.childCount > 0) {
      const tree: DocumentChildrenResponse = await api.listDocumentTree(document.id);
      documentChildren = { ...documentChildren, ...buildDocumentTree(tree.items) };
    }
    return {
      activeId,
      document,
      documentChildren,
      documents: listResponse.items,
      error: null,
      folders: folderResponse.items,
      nextCursor: listResponse.nextCursor,
      unauthorized: false,
      view: routeView,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        activeId,
        document: null,
        documentChildren: {},
        documents: [],
        error: null,
        folders: [],
        nextCursor: null,
        unauthorized: true,
        view: routeView,
      };
    }

    return {
      activeId,
      document: null,
      documentChildren: {},
      documents: [],
      error: error instanceof Error ? error.message : '工作区加载失败',
      folders: [],
      nextCursor: null,
      unauthorized: false,
      view: routeView,
    };
  }
}
