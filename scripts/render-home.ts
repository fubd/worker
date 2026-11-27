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
<html lang="zh-CN">
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
    <div id="root"></div>
    <script data-yuyan-public-shell>var c=document.cookie,s=c.includes("yuyan_has_session=1"),l=s?"进入文档":"开始写作",p=s?"/docs":"/login";document.getElementById("root").innerHTML='<div class="swan-home"><header class="swan-public-header"><a class="swan-public-brand" href="/" aria-label="雨燕首页"><svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#3B82F6"></rect><path d="M4 29C11 21 18 19 24 22C28 18 34 17 40 19C36 22 34 25 33 29C29 27 27 29 25 32L20 40L18 31C13 27 9 27 4 29Z" fill="#FFFFFF"></path></svg><span><strong>雨燕</strong><small>让文字飞起来</small></span></a><nav class="swan-public-nav" aria-label="首页导航"><a href="#about-yuyan">为什么是雨燕</a><a class="swan-public-login" href="'+p+'">'+(s?"进入文档":"登录")+'</a></nav></header><main><section class="swan-home-hero"><div class="swan-home-copy"><span class="swan-public-eyebrow">Yuyan / 雨燕</span><h1>让文字<br><em>飞起来。</em></h1><p>给还没写完的念头留一处安静的地方。打开就能写，离开也会保存，下一次回来继续往前。</p><div class="swan-home-actions"><a class="swan-public-button is-primary" href="'+p+'">'+l+' <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></a><a class="swan-public-button is-secondary" href="#about-yuyan">看看雨燕</a></div><ul class="swan-home-proof" aria-label="产品特点"><li>私人空间</li><li>自动保存</li><li>随时续写</li></ul></div><section class="swan-home-scene" aria-label="雨燕文档与飞行轨迹插画"><article class="swan-home-paper"><span class="swan-home-paper-meta">TODAY / 11.22</span><h2>窗外的风</h2><div class="swan-home-paper-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></article><span class="swan-home-paper is-back" aria-hidden="true"></span></section></section><section class="swan-home-about" id="about-yuyan"><div><span class="swan-public-eyebrow">安静地写</span><h2>没有信息流，只有你的文字。</h2></div><div class="swan-home-about-points"><p><strong>属于自己</strong>文档只对所有者开放，内容不会进入公开信息流。</p><p><strong>一直保存</strong>每一次修改都会自动保存，不必反复点击保存按钮。</p><p><strong>继续向前</strong>下次回来时，仍然从停下的那一句话继续写。</p></div></section></main><footer class="swan-public-footer"><span>雨燕 · 让文字飞起来</span><a href="'+p+'">'+(s?"打开文档":"登录雨燕")+'</a></footer></div>';</script>
    <script data-yuyan-public-shell>window.__staticRouterHydrationData=${JSON.stringify({ loaderData: context.loaderData, actionData: context.actionData }).replaceAll('<', '\\u003c')};</script>
    <script>addEventListener("load",()=>{var s=document.createElement("script");s.type="module";s.src="${staticNames.find((asset) => /index\.[a-z0-9]+\.mjs$/.test(asset))}";document.head.append(s)},{once:true})</script>
  </body>
</html>`;

mkdirSync('dist/server', { recursive: true });
writeFileSync(
  'dist/server/home.mjs',
  `export const homeShell = ${JSON.stringify(shell)};\nexport async function renderStaticRoute() { return ${render}; }`,
);
console.log(`[static] wrote ${publicCssName} (${statSync(publicCss).size} bytes)`);
