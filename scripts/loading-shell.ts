/**
 * 给 SPA shell 注入首帧加载骨架：React 启动前 #root 不再纯白。
 *
 * 只注入 index-cn.html 和 shell-global.html；首页有首屏快照，不注入。
 * 骨架用内联 CSS 和唯一前缀，不依赖尚未加载的 OSS/Vercel CSS。
 * React 挂载前由 src/client/main.tsx 的 container.replaceChildren() 清空。
 */
import type { TodoListSnapshot } from '../src/shared/types';

const SHELL_STYLE = `<style id="swan-boot-style">
  #root { min-height: 100vh; background: var(--swan-bg, #f4f7fb); }
  .swan-boot { display: flex; min-height: 100vh; }
  .swan-boot-sider { width: 240px; flex: 0 0 240px; background: var(--swan-panel, #fff); border-right: 1px solid var(--swan-border, #e9ebf0); }
  .swan-boot-main { flex: 1; min-width: 0; padding: 24px; }
  .swan-boot-header { height: 32px; width: 180px; border-radius: 8px; background: var(--swan-skeleton, #e9eef5); margin-bottom: 24px; }
  .swan-boot-card { height: 120px; border-radius: 12px; background: var(--swan-skeleton, #e9eef5); margin-bottom: 16px; }
  .swan-boot-todos { display: none; overflow: hidden; border: 1px solid var(--swan-border, #e9ebf0); border-radius: 12px; background: var(--swan-panel, #fff); }
  html[data-swan-shell-route="todos"] .swan-boot-todos { display: block; }
  html[data-swan-shell-route="todos"] .swan-boot-skeleton { display: none; }
  .swan-boot-todos-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--swan-border, #e9ebf0); font-size: 16px; font-weight: 600; }
  .swan-boot-todos-count { padding: 2px 8px; border-radius: 6px; background: #e8f1ff; color: #1677ff; font-size: 12px; font-weight: 500; }
  .swan-boot-todos-list { padding: 8px 20px 16px; }
  .swan-boot-todo { display: flex; align-items: center; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--swan-border, #e9ebf0); color: #0f172a; }
  .swan-boot-todo:last-child { border-bottom: 0; }
  .swan-boot-todo-check { width: 16px; height: 16px; flex: 0 0 16px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; }
  .swan-boot-todo-check.is-done { border-color: #1677ff; background: #1677ff; }
  .swan-boot-todo-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .swan-boot-todo-title.is-done { color: #94a3b8; text-decoration: line-through; }
  .swan-boot-todo-id { margin-left: auto; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  @media (max-width: 991.98px) {
    .swan-boot-sider { display: none; }
    .swan-boot-main { padding: 16px; }
    .swan-boot-header { height: 28px; width: 140px; }
    .swan-boot-card { height: 96px; }
  }
</style>`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function todosSnapshotHtml(snapshot: TodoListSnapshot | null): string {
  if (!snapshot) return '';
  const done = snapshot.items.filter((todo) => todo.completed).length;
  const rows = snapshot.items
    .map(
      (todo) => `<div class="swan-boot-todo">
        <span class="swan-boot-todo-check${todo.completed ? ' is-done' : ''}"></span>
        <span class="swan-boot-todo-title${todo.completed ? ' is-done' : ''}">${escapeHtml(todo.title)}</span>
        <span class="swan-boot-todo-id">#${todo.id}</span>
      </div>`,
    )
    .join('');
  return `<section class="swan-boot-todos" aria-label="待办快照">
    <div class="swan-boot-todos-head"><span>任务列表</span><span class="swan-boot-todos-count">${done}/${snapshot.items.length}</span></div>
    <div class="swan-boot-todos-list">${rows}</div>
  </section>`;
}

function shellRoot(snapshot: TodoListSnapshot | null): string {
  return `<div id="root"><div class="swan-boot" aria-hidden="true"><div class="swan-boot-sider"></div><div class="swan-boot-main"><div class="swan-boot-header"></div>${todosSnapshotHtml(snapshot)}<div class="swan-boot-skeleton"><div class="swan-boot-card"></div><div class="swan-boot-card"></div></div></div></div></div>`;
}

function shellRouteScript(snapshot: TodoListSnapshot | null): string {
  const mark =
    snapshot === null
      ? ''
      : `document.documentElement.dataset.swanShellRoute = 'todos';
  requestAnimationFrame(function () {
    if (!performance.getEntriesByName('swan:todos-data-visible').length) {
      performance.mark('swan:todos-data-visible');
    }
  });`;
  return `<script id="swan-shell-route">
(function () {
  if (location.pathname !== '/todos') return;
  ${mark}
})();
</script>`;
}

export function injectLoadingShell(
  html: string,
  todosSnapshot: TodoListSnapshot | null = null,
): string {
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('loading shell: <div id="root"></div> not found');
  }
  return html
    .replace('</head>', `    ${SHELL_STYLE}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      `${shellRoot(todosSnapshot)}\n    ${shellRouteScript(todosSnapshot)}`,
    );
}
