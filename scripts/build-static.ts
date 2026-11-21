/**
 * Render every public route through the same React Router route table used by
 * the browser. Rsbuild's node environment produces the renderer; this script
 * only injects its output into Rsbuild's browser HTML template.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { injectStaticSpeedInsights } from './static-speed-insights';
import { readTodosSnapshot } from './todos-snapshot';
import type { TodoListSnapshot } from '../src/shared/types';

type StaticRender = {
  html: string;
  styles: string;
  hydrationData: {
    loaderData: Record<string, unknown>;
    actionData: Record<string, unknown> | null;
  };
};

type ServerEntry = {
  renderStaticRoute(options: {
    path: string;
    todosSnapshot?: TodoListSnapshot | null;
  }): Promise<StaticRender>;
};

const DIST = 'dist';
const SERVER_ENTRY = resolve(DIST, 'server/server.mjs');

function injectRender(template: string, render: StaticRender): string {
  if (!template.includes('<div id="root"></div>')) {
    throw new Error('browser template is missing <div id="root"></div>');
  }
  const hydrationJson = JSON.stringify(render.hydrationData)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  const withStyles = template.replace(
    '</head>',
    `${render.styles}\n  <script>window.__staticRouterHydrationData = ${hydrationJson};</script>\n  </head>`,
  );
  return withStyles.replace('<div id="root"></div>', `<div id="root">${render.html}</div>`);
}

function removeReactRuntime(html: string): string {
  return html
    .replace(/\s*<script type="module" src="\/static\/js\/[^"]+"><\/script>/g, '')
    .replace(/\s*<link rel="modulepreload" href="[^"]+"\s*\/?>/gi, '')
    .replace(/\s*<script[^>]*>window\.__staticRouterHydrationData[\s\S]*?<\/script>/g, '');
}

function injectTodosSnapshot(html: string, snapshot: TodoListSnapshot | null): string {
  if (!snapshot) return html;
  const json = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
  return html.replace(
    '</head>',
    `    <script id="swan-todos-snapshot" type="application/json">${json}</script>\n  </head>`,
  );
}

if (!existsSync(`${DIST}/index.html`)) {
  throw new Error('dist/index.html is missing; run rsbuild build first');
}
if (!existsSync(SERVER_ENTRY)) {
  throw new Error('dist/server/server.mjs is missing; enable the Rsbuild node environment');
}

const template = readFileSync(`${DIST}/index.html`, 'utf8');
const todosSnapshot = readTodosSnapshot(DIST);
const server = (await import(pathToFileURL(SERVER_ENTRY).href)) as ServerEntry;

for (const path of ['/', '/docs', '/todos', '/about'] as const) {
  const render = await server.renderStaticRoute({ path, todosSnapshot });
  let html = injectRender(template, render);
  if (path === '/about') {
    html = injectStaticSpeedInsights(removeReactRuntime(html), '/about');
    if (/<script\b[^>]*type=["']module["']/i.test(html)) {
      throw new Error('/about still references the React runtime');
    }
  } else {
    html = injectTodosSnapshot(html, todosSnapshot);
  }

  const file = path === '/' ? 'home.html' : `${path.slice(1)}.html`;
  writeFileSync(`${DIST}/${file}`, html);
  console.log(`[static] wrote dist/${file} (${statSync(`${DIST}/${file}`).size} bytes)`);
}
