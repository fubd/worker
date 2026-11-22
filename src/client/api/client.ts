import type { AuthSessionResponse, DocumentListResponse, DocumentRecord } from '@/shared/types';
import { apiPath } from '@/shared/api-config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; runtime: string; environment: string; time: string }>('/health'),

  getSession: () => request<AuthSessionResponse>('/auth/me', { cache: 'no-store' }),

  loginWithPassword: (email: string, password: string) =>
    request<AuthSessionResponse>('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  setPassword: (password: string) =>
    request<AuthSessionResponse>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listDocuments: (options: { signal?: AbortSignal } = {}) =>
    request<DocumentListResponse>('/documents', {
      cache: 'no-store',
      signal: options.signal,
    }),

  listTrashDocuments: (options: { signal?: AbortSignal } = {}) =>
    request<DocumentListResponse>('/documents/trash', {
      cache: 'no-store',
      signal: options.signal,
    }),

  getDocument: (id: number, options: { signal?: AbortSignal } = {}) =>
    request<DocumentRecord>(`/documents/${id}`, {
      cache: 'no-store',
      signal: options.signal,
    }),

  createDocument: (title = '无标题文档') =>
    request<DocumentRecord>('/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  updateDocument: (
    id: number,
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

  deleteDocument: (id: number) =>
    request<{ ok: boolean; id: number }>(`/documents/${id}`, {
      method: 'DELETE',
    }),

  restoreDocument: (id: number) =>
    request<DocumentRecord>(`/documents/${id}/restore`, {
      method: 'POST',
    }),
};
