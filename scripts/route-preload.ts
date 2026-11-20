/**
 * 构建期解析 /todos 的 async chunk 依赖，生成 shell 内的预加载脚本。
 *
 * 入口的 runtime 里有：
 *   b.u = e => "static/js/async/" + e + "." + ({a:"…",k:"…",…})[e] + ".mjs"
 *   const TodosPage = lazy(() => Promise.all([l.e("z"), l.e("k"), l.e("a")])…)
 * 这里按 TodosPage 的独有文案定位它的 chunk，再取包含它的 Promise.all 列表，
 * 避免硬编码 hash；构建产物变了也能自动跟上。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { productionApiUrl } from '../src/shared/api-config';
import type { TodoListSnapshot } from '../src/shared/types';

export function findEntryFile(distDir: string): string {
  const files = readdirSync(`${distDir}/static/js`).filter((file) =>
    /^index\.[a-f0-9]+\.mjs$/.test(file),
  );
  if (files.length !== 1) throw new Error(`expected one entry chunk, found ${files.length}`);
  return files[0];
}

export function findAntdFile(distDir: string): string {
  const files = readdirSync(`${distDir}/static/js`).filter((file) =>
    /^lib-antd\.[a-f0-9]+\.mjs$/.test(file),
  );
  if (files.length !== 1) throw new Error(`expected one antd chunk, found ${files.length}`);
  return files[0];
}

/** /todos 首屏要加载的 async chunk 文件名（含依赖），按 Promise.all 顺序。 */
export function todosRouteFiles(distDir: string): string[] {
  const entry = readFileSync(`${distDir}/static/js/${findEntryFile(distDir)}`, 'utf8');
  const asyncDir = `${distDir}/static/js/async`;

  const files = readdirSync(asyncDir);
  const todosFiles = files.filter((file) =>
    readFileSync(`${asyncDir}/${file}`, 'utf8').includes('任务列表'),
  );
  if (todosFiles.length !== 1) {
    throw new Error(`expected one TodosPage chunk, found ${todosFiles.length}`);
  }
  const todosId = todosFiles[0].split('.')[0];

  // runtime 的 chunk 文件名映射：<id> -> <contenthash>
  const asyncMarker = entry.indexOf('static/js/async/');
  const mapStart = entry.indexOf('{', asyncMarker);
  const mapEnd = entry.indexOf('}', mapStart);
  if (asyncMarker < 0 || mapStart < 0 || mapEnd < mapStart) {
    throw new Error('async chunk filename map not found in entry');
  }
  const hashes = new Map<string, string>();
  for (const match of entry.slice(mapStart, mapEnd + 1).matchAll(/([a-z]+):"([a-f0-9]+)"/g)) {
    hashes.set(match[1], match[2]);
  }

  const lists = [...entry.matchAll(/Promise\.all\(\[([^\]]*)\]\)/g)].map((match) =>
    [...match[1].matchAll(/\.e\("([^"]+)"\)/g)].map((id) => id[1]),
  );
  const deps = lists.find((ids) => ids.includes(todosId));
  if (!deps) throw new Error('TodosPage chunk dependency list not found');

  return deps.map((id) => {
    const hash = hashes.get(id);
    if (!hash) throw new Error(`missing contenthash for async chunk ${id}`);
    return `${id}.${hash}.mjs`;
  });
}

/** 只在 /todos 生效的路由 chunk 预加载脚本。 */
export function routePreloadScript(files: string[], base: string, crossorigin: boolean): string {
  const attrs = crossorigin ? "link.crossOrigin = 'anonymous';" : '';
  return `<script id="swan-route-preload">
(function () {
  if (location.pathname !== '/todos') return;
  var files = ${JSON.stringify(files)};
  for (var i = 0; i < files.length; i++) {
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = ${JSON.stringify(base)} + files[i];
    ${attrs}
    document.head.appendChild(link);
  }
})();
</script>`;
}

/** 只在 /todos 提前发默认列表请求；客户端会消费这个 promise，不会双请求。 */
export function apiPrefetchScript(): string {
  return `<script id="swan-api-prefetch">
(function () {
  if (location.pathname !== '/todos') return;
  window.__swanTodosPrefetch = fetch(${JSON.stringify(productionApiUrl('/todos'))}, { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : null; })
    .catch(function () { return null; });
})();
</script>`;
}

function todosSnapshotScript(snapshot: TodoListSnapshot | null): string {
  if (!snapshot) return '';
  const json = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
  return `<script id="swan-todos-snapshot" type="application/json">${json}</script>`;
}

/**
 * 把 API 预取和最近列表快照放到 importmap、模块脚本前面。
 * 快照负责立即渲染，API 预取负责后台刷新。
 */
export function injectTodosBootstrap(html: string, snapshot: TodoListSnapshot | null): string {
  const anchor = '<meta name="swan-vendor" content="global-static" />';
  const occurrences = html.split(anchor).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected one vendor marker anchor, found ${occurrences}`);
  }
  if (html.includes('id="swan-api-prefetch"')) {
    throw new Error('API prefetch script was injected more than once');
  }
  if (html.includes('id="swan-todos-snapshot"')) {
    throw new Error('todos snapshot was injected more than once');
  }
  return html.replace(
    anchor,
    `${anchor}\n    ${apiPrefetchScript()}\n    ${todosSnapshotScript(snapshot)}`,
  );
}
