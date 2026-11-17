/**
 * 构建期把默认待办列表写进 shell，首帧直接用；客户端随后静默刷新。
 *
 * 数据来自生产 API（INITIAL_TODOS_URL 可覆盖，本地测试时可指向本地 stub）。
 * 拉取失败不影响构建，只是回到「骨架 + API 预取」的路径。
 */
import type { TodoListResponse } from '../src/shared/types';

export async function fetchInitialTodos(): Promise<TodoListResponse | null> {
  const url = process.env.INITIAL_TODOS_URL ?? 'https://deephos.com/api/todos';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as TodoListResponse;
    return Array.isArray(data?.items) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function initialTodosScript(data: TodoListResponse | null): string {
  if (!data) return '';
  // 防止数据里出现 </script> 提前闭合
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script id="swan-initial-todos">window.__swanTodosInitial = ${json};</script>`;
}
