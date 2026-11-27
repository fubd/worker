/**
 * Render public and private entry shells through the same React Router table
 * used by the browser. Authentication and document data load after hydration.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type StaticRender = {
  html: string;
  styles: string;
  hydrationData: {
    loaderData: Record<string, unknown>;
    actionData: Record<string, unknown> | null;
  };
};

type ServerEntry = {
  renderStaticRoute(options: { path: string }): Promise<StaticRender>;
};

const DIST = 'dist';
const SERVER_ENTRY = resolve(DIST, 'server/server.mjs');
const HOME_SERVER_ENTRY = resolve(DIST, 'server/home.mjs');
type HomeServer = ServerEntry & { homeShell: string };

execFileSync(process.execPath, ['scripts/render-home.ts'], { stdio: 'inherit' });

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

if (!existsSync(`${DIST}/index.html`)) {
  throw new Error('dist/index.html is missing; run rsbuild build first');
}
if (!existsSync(SERVER_ENTRY)) {
  throw new Error('dist/server/server.mjs is missing; enable the Rsbuild node environment');
}
if (!existsSync(HOME_SERVER_ENTRY)) {
  throw new Error('dist/server/home.mjs is missing; enable the Rsbuild node environment');
}

const template = readFileSync(`${DIST}/index.html`, 'utf8');
const server = (await import(pathToFileURL(SERVER_ENTRY).href)) as ServerEntry;
const homeServer = (await import(pathToFileURL(HOME_SERVER_ENTRY).href)) as HomeServer;
const pages = [
  { path: '/', output: 'index.html' },
  { path: '/login', output: 'login.html' },
  { path: '/docs', output: 'docs.html' },
  { path: '/share/preview', output: 'share.html' },
] as const;

for (const page of pages) {
  const output = `${DIST}/${page.output}`;
  if (page.path === '/') {
    writeFileSync(output, homeServer.homeShell);
  } else {
    writeFileSync(
      output,
      injectRender(template, await server.renderStaticRoute({ path: page.path })),
    );
  }
  console.log(`[static] wrote dist/${page.output} (${statSync(output).size} bytes)`);
}
