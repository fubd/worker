import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';

import { createRoutes, loadInitialRouteModules } from '../src/client/routes';

const path = '/';
const routes = createRoutes(await loadInitialRouteModules(path));
const { query, dataRoutes } = createStaticHandler(routes);
const context = await query(new Request(new URL(path, 'https://deephos.com')));
if (context instanceof Response) {
  throw new Error(`Static home render unexpectedly returned HTTP ${context.status}`);
}

const html = renderToString(
  createElement(StaticRouterProvider, {
    router: createStaticRouter(dataRoutes, context),
    context,
    hydrate: false,
  }),
);
const footerMarker = '<span>雨燕 · 让文字飞起来</span><a href=';
const footerStart = html.lastIndexOf(footerMarker);
const footerEnd = html.indexOf('</a>', footerStart);
const publicHtml =
  footerStart < 0 || footerEnd < 0
    ? html
    : `${html.slice(0, footerStart + footerMarker.length - 2)}data-swan-public-home="footer" ${html.slice(footerStart + footerMarker.length - 2, footerEnd)}${html.slice(footerEnd)}`;
const styles = '';
const staticNames = [...readFileSync('dist/index.html', 'utf8').matchAll(/\/static\/[^"']+/g)].map(
  ([asset]) => asset,
);
const publicStyles = readFileSync('src/client/styles/public.css', 'utf8');
mkdirSync('dist/static/css', { recursive: true });
const cssHash = createHash('sha256').update(publicStyles).digest('hex').slice(0, 8);
const publicCss = `dist/static/css/public.${cssHash}.css`;
writeFileSync(publicCss, publicStyles);
const publicCssName = publicCss.slice('dist'.length);
const render = JSON.stringify({
  html,
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
    <title>雨燕 · 让文字飞起来</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preload" href="${publicCssName}" as="style">
    <link rel="stylesheet" href="${publicCssName}">
    ${styles}
  </head>
  <body>
    <div id="root">${publicHtml}</div>
    <script data-yuyan-public-shell>window.__staticRouterHydrationData=${JSON.stringify({ loaderData: context.loaderData, actionData: context.actionData }).replaceAll('<', '\\u003c')}</script>
    <script type="module" src="${staticNames.find((asset) => /index\.[a-z0-9]+\.mjs$/.test(asset))}"></script>
  </body>
</html>`;

mkdirSync('dist/server', { recursive: true });
writeFileSync(
  'dist/server/home.mjs',
  `export const homeShell = ${JSON.stringify(shell)};\nexport async function renderStaticRoute() { return ${render}; }`,
);
console.log(`[static] wrote ${publicCssName} (${statSync(publicCss).size} bytes)`);
