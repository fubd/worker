/**
 * Render public and private entry shells through the same React Router table
 * used by the browser. Authentication and document data load after hydration.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
const HOME_ENTRY = resolve(DIST, 'server/home-html.mjs');
const HOME_RENDERED_ENTRY = resolve(DIST, 'server/home-html.txt');
const HOME_FRESH_ENTRY = resolve(DIST, 'server/home-html-fresh.txt');
type HomeServer = ServerEntry & {
  homeShell: string;
  memberShell: string;
  visitorShell: string;
};

execFileSync(process.execPath, ['scripts/build-home-template.ts'], { stdio: 'inherit' });

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
if (!existsSync(HOME_ENTRY)) {
  throw new Error('dist/server/home-html.mjs is missing; enable the Rsbuild node environment');
}

const indexHtml = `${DIST}/index.html`;
const template = readFileSync(indexHtml, 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('build-static requires the untouched Rsbuild template');
}
// Wrangler needs its assets directory before Vercel rewrites are assembled.
mkdirSync(`${DIST}/vercel`, { recursive: true });
const server = (await import(pathToFileURL(SERVER_ENTRY).href)) as ServerEntry;
const homeServer = (await import(pathToFileURL(HOME_ENTRY).href)) as HomeServer;
writeFileSync(
  HOME_RENDERED_ENTRY,
  `${homeServer.visitorShell}\n<!----yuyan-member-home---->\n${homeServer.memberShell}`,
);
writeFileSync(
  HOME_FRESH_ENTRY,
  `${homeServer.visitorShell}\n<!----yuyan-member-home---->\n${homeServer.memberShell}`,
);
const pages = [
  { path: '/', output: 'index.html' },
  { path: '/login', output: 'login.html' },
  { path: '/docs', output: 'docs.html' },
  { path: '/share/preview', output: 'share.html' },
] as const;

for (const page of pages) {
  const output = `${DIST}/${page.output}`;
  if (page.path === '/') {
    writeFileSync('dist/visitor.html', homeServer.visitorShell);
    writeFileSync('dist/member.html', homeServer.memberShell);
    writeFileSync(
      output,
      template.replace('<div id="root"></div>', `<div id="root">${homeServer.visitorShell}</div>`),
    );
  } else {
    writeFileSync(
      output,
      injectRender(template, await server.renderStaticRoute({ path: page.path })),
    );
  }
  console.log(`[static] wrote dist/${page.output} (${statSync(output).size} bytes)`);
}
