import type { Todo, TodoListResponse, TodoStats, TodoStatusFilter } from '@/shared/types';

declare global {
  interface Window {
    /** shell 内联预取的默认列表；客户端只消费一次 */
    __swanTodosPrefetch?: Promise<TodoListResponse | null> | null;
  }
}

const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
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

  stats: () => request<TodoStats>('/stats'),

  listTodos: (params: { status?: TodoStatusFilter; keyword?: string } = {}) => {
    const status = params.status ?? 'all';
    const keyword = params.keyword?.trim() ?? '';
    // shell 已在 HTML 解析时预取默认列表；只消费一次，失败则回退到正常请求
    if (status === 'all' && !keyword && window.__swanTodosPrefetch) {
      const prefetch = window.__swanTodosPrefetch;
      window.__swanTodosPrefetch = null;
      return prefetch.then((data) =>
        data && Array.isArray(data.items) ? data : request<TodoListResponse>('/todos'),
      );
    }
    const search = new URLSearchParams();
    if (status !== 'all') search.set('status', status);
    if (keyword) search.set('q', keyword);
    const query = search.toString();
    return request<TodoListResponse>(`/todos${query ? `?${query}` : ''}`);
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
