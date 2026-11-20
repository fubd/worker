import type { TodoListSnapshot } from '../src/shared/types';

/**
 * Embed the build-time todo list as inert JSON for the initial HTML snapshot.
 * The route chunk and API refresh are discovered by the normal React boot path.
 */
export function injectTodosSnapshot(html: string, snapshot: TodoListSnapshot | null): string {
  if (!snapshot) return html;
  if (html.includes('id="swan-todos-snapshot"')) {
    throw new Error('todos snapshot was injected more than once');
  }
  const json = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
  return html.replace(
    '</head>',
    `    <script id="swan-todos-snapshot" type="application/json">${json}</script>\n  </head>`,
  );
}
