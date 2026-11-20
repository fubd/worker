/**
 * 给 SPA shell 注入首帧完整布局和待办快照：React 启动前左右内容同时可见。
 *
 * 只注入 shell-global.html；首页有首屏快照，不注入。
 * 结构复用应用 CSS，避免入口 JS 加载完成后侧栏和标题栏才出现。
 * React 挂载前由 src/client/main.tsx 的 container.replaceChildren() 清空。
 */
import type { TodoListSnapshot } from '../src/shared/types';

const SHELL_STYLE = `<style id="swan-boot-style">
  .swan-boot-icon { display: inline-flex; width: 1em; height: 1em; flex: 0 0 1em; }
  .swan-boot-icon svg { display: block; width: 100%; height: 100%; }
  @media (max-width: 991.98px) {
    .swan-boot-sider { display: none !important; }
  }
</style>`;

const ICONS = {
  dashboard:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h7v7H3V3Zm11 0h7v4h-7V3ZM3 14h7v7H3v-7Zm11-3h7v10h-7V11Z"/></svg>',
  todos:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7.5 12 3 3 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5V17M12 7.2v.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>',
  server:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="14" width="17" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg>',
  api: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 5 8l3 3M16 5l3 3-3 3M5 8h14M8 19l-3-3 3-3M16 19l3-3-3-3M5 16h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
} as const;

function icon(name: keyof typeof ICONS): string {
  return `<span class="swan-boot-icon">${ICONS[name]}</span>`;
}

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
      (todo) => `<div class="swan-todos-preview-row">
        <span class="swan-todos-preview-check${todo.completed ? ' is-done' : ''}"></span>
        <span class="swan-todos-preview-title${todo.completed ? ' is-done' : ''}">${escapeHtml(todo.title)}</span>
        <span class="swan-todos-preview-id">#${todo.id}</span>
      </div>`,
    )
    .join('');
  return `<section class="swan-card swan-todos-preview" aria-label="待办快照">
    <div class="swan-todos-preview-head"><span>任务列表</span><span class="swan-todos-preview-count">${done}/${snapshot.items.length}</span></div>
    <div class="swan-todos-preview-list">${rows}</div>
  </section>`;
}

function shellRoot(snapshot: TodoListSnapshot | null): string {
  return `<div id="root"><div class="swan-shell">
    <aside class="swan-sider swan-boot-sider" style="width: 228px">
      <div class="swan-logo"><span class="swan-logo-mark">S</span><span class="swan-logo-text">Swan Worker<small>edge runtime</small></span></div>
      <nav class="swan-menu" aria-label="站点导航">
        <div class="swan-menu-item"><a href="/"><span class="swan-menu-icon">${icon('dashboard')}</span><span class="swan-menu-label">概览</span></a></div>
        <div class="swan-menu-item is-selected" aria-current="page"><a href="/todos"><span class="swan-menu-icon">${icon('todos')}</span><span class="swan-menu-label">待办 Demo</span></a></div>
        <div class="swan-menu-item"><a href="/about"><span class="swan-menu-icon">${icon('info')}</span><span class="swan-menu-label">技术栈</span></a></div>
      </nav>
    </aside>
    <div class="swan-main">
      <header class="swan-header">
        <div class="swan-header-left"><span class="swan-icon-button" aria-hidden="true"><span class="swan-boot-icon">${ICONS.menu}</span></span><span class="swan-title">待办 Demo</span></div>
        <div class="swan-header-right"><span class="swan-chip">${icon('server')}Workers</span><span class="swan-chip swan-chip-plain">${icon('api')}Hono</span></div>
      </header>
      <main class="swan-content"><div class="swan-content-inner">${todosSnapshotHtml(snapshot)}</div></main>
      <footer class="swan-footer">Swan Worker · Bun + React 19 + Ant Design 6 + Rsbuild + Hono + Cloudflare D1</footer>
    </div>
  </div></div>`;
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
