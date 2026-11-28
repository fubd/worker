import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';

import { createRoutes, loadInitialRouteModules } from '../src/client/routes';
import { HOME_BUILD_HASH } from '../src/shared/home-session';

const path = '/';
const routes = createRoutes(await loadInitialRouteModules(path));
const { query, dataRoutes } = createStaticHandler(routes);
const context = await query(new Request(new URL(path, 'https://deephos.com')));
if (context instanceof Response) {
  throw new Error(`Static home render unexpectedly returned HTTP ${context.status}`);
}

function renderHomeHtml(): string {
  return renderToString(
    createElement(StaticRouterProvider, {
      router: createStaticRouter(dataRoutes, context),
      context,
      hydrate: false,
    }),
  );
}
function publicHome(html: string): string {
  const footerMarker = '<span>雨燕 · 让文字飞起来</span><a href=';
  const footerStart = html.lastIndexOf(footerMarker);
  const footerEnd = html.indexOf('</a>', footerStart);
  return footerStart < 0 || footerEnd < 0
    ? html
    : `${html.slice(0, footerStart + footerMarker.length - 2)}data-swan-public-home="footer" ${html.slice(footerStart + footerMarker.length - 2, footerEnd)}${html.slice(footerEnd)}`;
}
const renderedHtml = renderHomeHtml();
const html = publicHome(renderedHtml);
const visitorHtml = html.replace(
  '<div class="swan-home">',
  '<div class="swan-home" data-yuyan-home-variant="visitor">',
);
const styles = '';
const indexHtml = 'dist/index.html';
if (!readFileSync(indexHtml, 'utf8').includes('<div id="root"></div>')) {
  const pristine = process.env.YUYAN_PREVIOUS_INDEX;
  if (!pristine || !readFileSync(pristine, 'utf8').includes('<div id="root"></div>')) {
    throw new Error('build-static must run before a standalone home render');
  }
  writeFileSync(indexHtml, readFileSync(pristine, 'utf8'));
}
const browserShell = readFileSync(indexHtml, 'utf8');
const moduleScripts = [
  ...browserShell.matchAll(/<script type="module" src="[^"]+"><\/script>/g),
].map(([script]) => script);
const stylesheetLinks = [...browserShell.matchAll(/<link href="[^"]+" rel="stylesheet">/g)].map(
  ([link]) => link,
);
if (!browserShell.includes('<div id="root"></div>')) {
  throw new Error('build-static must run before a standalone home render');
}
const publicStyles = readFileSync('src/client/styles/public.css', 'utf8');
mkdirSync('dist/static/css', { recursive: true });
const cssHash = createHash('sha256').update(publicStyles).digest('hex').slice(0, 8);
const publicCss = `dist/static/css/public.${cssHash}.css`;
writeFileSync(publicCss, publicStyles);
const publicCssName = publicCss.slice('dist'.length);
const render = JSON.stringify({
  html: visitorHtml,
  styles,
  hydrationData: { loaderData: context.loaderData, actionData: context.actionData },
});
const shell = `<!doctype html>
<html lang="zh-CN" data-swan-public-shell>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7faff">
    <meta name="description" content="雨燕，让文字飞起来。">
    <meta name="yuyan-home-auth" content="visitor">
    <title>雨燕 · 让文字飞起来</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preload" href="${publicCssName}" as="style">
    <link rel="stylesheet" href="${publicCssName}">
    ${moduleScripts.join('')}
    ${stylesheetLinks.join('')}
    ${styles}
  </head>
  <body>
    <div id="root">${visitorHtml}</div>
    <script data-yuyan-public-shell>window.__staticRouterHydrationData=${JSON.stringify({ loaderData: context.loaderData, actionData: context.actionData }).replaceAll('<', '\\u003c')}</script>
  </body>
</html>`;

const memberHtml = publicHome(
  renderedHtml
    .replaceAll(
      'href="/login" data-swan-public-home="nav">登录',
      'href="/docs" data-swan-public-home="nav">进入文档',
    )
    .replace(
      'href="/login" data-swan-public-home="primary">',
      'href="/docs" data-swan-public-home="primary">',
    )
    .replaceAll('>开始写作<', '>进入文档<')
    .replace(
      'href="/login" data-swan-public-home="footer">登录雨燕',
      'href="/docs" data-swan-public-home="footer">打开文档',
    )
    .replace('<div class="swan-home">', '<div class="swan-home" data-yuyan-home-variant="member">'),
);
const memberShell = shell
  .replace(visitorHtml, memberHtml)
  .replace('</head>', '  <meta name="yuyan-home-auth" content="member">\n  </head>')
  .replaceAll(HOME_BUILD_HASH, process.env.YUYAN_HOME_BUILD ?? 'candidate');
const visitorShell = shell
  .replace('</head>', '  <meta name="yuyan-home-auth" content="visitor">\n  </head>')
  .replaceAll(HOME_BUILD_HASH, process.env.YUYAN_HOME_BUILD ?? 'candidate');
mkdirSync('dist/server', { recursive: true });
writeFileSync(
  'dist/server/home-template.mjs',
  `export const homeShell = ${JSON.stringify(shell)};\nexport const visitorShell = ${JSON.stringify(visitorShell)};\nexport const memberShell = ${JSON.stringify(memberShell)};\nexport async function renderStaticRoute() { return ${render}; }`,
);
if (memberHtml.includes('>开始写作<') || !memberHtml.includes('进入文档')) {
  throw new Error('member home was not prepared correctly');
}
console.log(`[static] wrote ${publicCssName} (${statSync(publicCss).size} bytes)`);
