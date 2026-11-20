import type {
  Todo,
  TodoListResponse,
  TodoListSnapshot,
  TodoStats,
  TodoStatusFilter,
} from '@/shared/types';
import { apiPath } from '@/shared/api-config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readInitialTodos(): TodoListSnapshot | null {
  const node = document.getElementById('swan-todos-snapshot');
  if (!node?.textContent) return null;
  try {
    const parsed = JSON.parse(node.textContent) as TodoListSnapshot;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

const initialTodos = readInitialTodos();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Do not add Content-Type to GET requests: that turns a cross-origin read
  // into a CORS preflight and costs an additional round trip.
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiPath(path), {
    ...init,
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
  initialTodos: () => initialTodos,

  health: () =>
    request<{ ok: boolean; runtime: string; environment: string; time: string }>('/health'),

  stats: () => request<TodoStats>('/stats'),

  listTodos: (
    params: { status?: TodoStatusFilter; keyword?: string } = {},
    options: { fresh?: boolean } = {},
  ) => {
    const status = params.status ?? 'all';
    const keyword = params.keyword?.trim() ?? '';
    const search = new URLSearchParams();
    if (status !== 'all') search.set('status', status);
    if (keyword) search.set('q', keyword);
    const query = search.toString();
    return request<TodoListResponse>(`/todos${query ? `?${query}` : ''}`, {
      cache: options.fresh ? 'reload' : 'no-store',
    });
  },

  createTodo: (title: string) =>
    request<Todo>('/todos', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  updateTodo: (id: number, input: { title?: string; completed?: boolean }) =>
    request<Todo>(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteTodo: (id: number) =>
    request<{ ok: boolean; id: number }>(`/todos/${id}`, {
      method: 'DELETE',
    }),

  clearCompleted: () => request<{ removed: number }>('/todos/completed', { method: 'DELETE' }),
};
