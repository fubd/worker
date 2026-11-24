import { isPublicId, type PublicId } from '@/shared/ids';
import type { DocumentRecord, DocumentSummary, FolderSummary } from '@/shared/types';
import { api, ApiError } from './api/client';
import { parseDocumentView, type DocumentView, type FolderScope } from './workspace-utils';

export interface DocsRouteData {
  activeId: PublicId | null;
  document: DocumentRecord | null;
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
    documents: [],
    error: null,
    folders: [],
    nextCursor: null,
    unauthorized: false,
    view,
  };
}

export async function loadDocsRouteData(request: Request): Promise<DocsRouteData> {
  const url = new URL(request.url);
  const view = parseDocumentView(url.searchParams.get('view'));
  const folderScope = parseFolderScope(url.searchParams.get('folder'));
  const searchQuery = url.searchParams.get('q')?.trim() ?? '';
  const activeId = parseActiveId(url.pathname, view);
  const folderId =
    folderScope === 'all' ? undefined : folderScope === 'unfiled' ? null : folderScope;

  try {
    const [folderResponse, listResponse, documentResult] = await Promise.all([
      api.listFolders(),
      view === 'trash'
        ? api.listTrashDocuments()
        : api.listDocuments({
            folderId: view === 'documents' ? folderId : undefined,
            query: searchQuery,
            favoriteOnly: view === 'favorites',
            recentOnly: view === 'recent',
          }),
      activeId
        ? api
            .getDocument(activeId)
            .then((document) => ({ document, error: null as string | null }))
            .catch((error: unknown) => {
              if (error instanceof ApiError && error.status === 401) throw error;
              return {
                document: null,
                error: error instanceof Error ? error.message : '文档加载失败',
              };
            })
        : Promise.resolve({ document: null, error: null }),
    ]);

    return {
      activeId,
      document: documentResult.document,
      documents: listResponse.items,
      error: documentResult.error,
      folders: folderResponse.items,
      nextCursor: listResponse.nextCursor,
      unauthorized: false,
      view,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        activeId,
        document: null,
        documents: [],
        error: null,
        folders: [],
        nextCursor: null,
        unauthorized: true,
        view,
      };
    }

    return {
      activeId,
      document: null,
      documents: [],
      error: error instanceof Error ? error.message : '工作区加载失败',
      folders: [],
      nextCursor: null,
      unauthorized: false,
      view,
    };
  }
}
