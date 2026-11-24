import type {
  AuthSessionResponse,
  DocumentListResponse,
  DocumentRecord,
  DocumentVersionListResponse,
  DocumentVersionRecord,
  FolderListResponse,
  FolderSummary,
  SharedDocument,
} from '@/shared/types';
import type { PublicId } from '@/shared/ids';
import { apiPath } from '@/shared/api-config';

export class ApiError extends Error {
  status: number;
  currentVersion?: number;

  constructor(message: string, status: number, currentVersion?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Do not add Content-Type to GET requests: that turns a cross-origin read
  // into a CORS preflight and costs an additional round trip.
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiPath(path), {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  const text = await response.text();

  // 服务端异常时可能返回 HTML（例如边缘层直接吐错误页），不能无脑 JSON.parse
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `请求失败（HTTP ${response.status}）`;
    throw new ApiError(
      message,
      response.status,
      (data as { currentVersion?: unknown } | null)?.currentVersion as number | undefined,
    );
  }

  return data as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; runtime: string; environment: string; time: string }>('/health'),

  getSession: () => request<AuthSessionResponse>('/auth/me', { cache: 'no-store' }),

  register: (input: { username: string; password: string }) =>
    request<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  loginWithPassword: (identifier: string, password: string) =>
    request<AuthSessionResponse>('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  setPassword: (input: { currentPassword?: string; password: string }) =>
    request<AuthSessionResponse>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listDocuments: (
    options: {
      signal?: AbortSignal;
      folderId?: PublicId | null;
      query?: string;
      favoriteOnly?: boolean;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.folderId === null) params.set('folder', 'unfiled');
    if (options.folderId) params.set('folder', options.folderId);
    if (options.query?.trim()) params.set('q', options.query.trim());
    if (options.favoriteOnly) params.set('favorite', '1');
    const search = params.size > 0 ? `?${params}` : '';
    return request<DocumentListResponse>(`/documents${search}`, {
      cache: 'no-store',
      signal: options.signal,
    });
  },

  listTrashDocuments: (options: { signal?: AbortSignal } = {}) =>
    request<DocumentListResponse>('/documents/trash', {
      cache: 'no-store',
      signal: options.signal,
    }),

  getDocument: (id: PublicId, options: { signal?: AbortSignal } = {}) =>
    request<DocumentRecord>(`/documents/${id}`, {
      cache: 'no-store',
      signal: options.signal,
    }),

  createDocument: (title = '无标题文档', folderId: PublicId | null = null) =>
    request<DocumentRecord>('/documents', {
      method: 'POST',
      body: JSON.stringify({ title, folderId }),
    }),

  duplicateDocument: (id: PublicId) =>
    request<DocumentRecord>(`/documents/${id}/duplicate`, {
      method: 'POST',
    }),

  updateDocument: (
    id: PublicId,
    input: {
      title?: string;
      content?: Record<string, unknown>;
      contentHtml?: string;
      contentText?: string;
      version: number;
    },
  ) =>
    request<DocumentRecord>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteDocument: (id: PublicId) =>
    request<{ ok: boolean; id: PublicId }>(`/documents/${id}`, {
      method: 'DELETE',
    }),

  restoreDocument: (id: PublicId) =>
    request<DocumentRecord>(`/documents/${id}/restore`, {
      method: 'POST',
    }),

  moveDocument: (id: PublicId, folderId: PublicId | null) =>
    request<DocumentRecord>(`/documents/${id}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),

  setDocumentFavorite: (id: PublicId, favorite: boolean) =>
    request<DocumentRecord>(`/documents/${id}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite }),
    }),

  setDocumentSharing: (id: PublicId, shared: boolean) =>
    request<DocumentRecord>(`/documents/${id}/share`, {
      method: 'PATCH',
      body: JSON.stringify({ shared }),
    }),

  getSharedDocument: (shareId: PublicId, options: { signal?: AbortSignal } = {}) =>
    request<SharedDocument>(`/shares/${shareId}`, {
      cache: 'no-store',
      signal: options.signal,
    }),

  listDocumentVersions: (id: PublicId, options: { signal?: AbortSignal } = {}) =>
    request<DocumentVersionListResponse>(`/documents/${id}/versions`, {
      cache: 'no-store',
      signal: options.signal,
    }),

  getDocumentVersion: (id: PublicId, version: number) =>
    request<DocumentVersionRecord>(`/documents/${id}/versions/${version}`, {
      cache: 'no-store',
    }),

  createDocumentCheckpoint: (id: PublicId) =>
    request<{ version: number }>(`/documents/${id}/versions`, {
      method: 'POST',
    }),

  restoreDocumentVersion: (id: PublicId, version: number, expectedVersion: number) =>
    request<DocumentRecord>(`/documents/${id}/versions/${version}/restore`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }),

  listFolders: (options: { signal?: AbortSignal } = {}) =>
    request<FolderListResponse>('/folders', {
      cache: 'no-store',
      signal: options.signal,
    }),

  createFolder: (name: string) =>
    request<FolderSummary>('/folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameFolder: (id: PublicId, name: string) =>
    request<FolderSummary>(`/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (id: PublicId) =>
    request<{ ok: boolean; id: PublicId }>(`/folders/${id}`, {
      method: 'DELETE',
    }),
};
