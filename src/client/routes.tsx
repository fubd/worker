import type { RouteObject } from 'react-router';

import RootLayout from './layouts/RootLayout';
import ErrorPage from './pages/ErrorPage';
import NotFoundPage from './pages/NotFoundPage';
import { loadDocsRoute, loadHomeRoute, loadLoginRoute } from './route-loaders';

type HomeModule = typeof import('./pages/HomePage');
type LoginModule = typeof import('./pages/LoginPage');
type DocsModule = typeof import('./pages/DocsPage');

export interface InitialRouteModules {
  home?: HomeModule;
  login?: LoginModule;
  docs?: DocsModule;
}

function RouteFallback() {
  return null;
}

export function createRoutes(initial: InitialRouteModules = {}): RouteObject[] {
  const homeRoute: RouteObject = {
    id: 'home',
    index: true,
    handle: { title: '雨燕 · 让文字飞起来' },
    ...(initial.home
      ? { Component: initial.home.default }
      : {
          lazy: async () => ({ Component: (await loadHomeRoute()).default }),
        }),
  };

  const loginRoute: RouteObject = {
    id: 'login',
    path: 'login',
    handle: { title: '登录 · 雨燕' },
    ...(initial.login
      ? { Component: initial.login.default }
      : {
          lazy: async () => ({ Component: (await loadLoginRoute()).default }),
        }),
  };

  const docsRoute: RouteObject = {
    id: 'docs',
    path: 'docs',
    handle: { title: '全部文档' },
    ...(initial.docs
      ? {
          Component: initial.docs.default,
          HydrateFallback: initial.docs.HydrateFallback,
        }
      : {
          lazy: async () => {
            const route = await loadDocsRoute();
            return {
              Component: route.default,
              HydrateFallback: route.HydrateFallback,
            };
          },
        }),
  };

  return [
    {
      id: 'root',
      errorElement: <ErrorPage />,
      HydrateFallback: RouteFallback,
      children: [
        homeRoute,
        loginRoute,
        {
          id: 'app',
          element: <RootLayout />,
          children: [docsRoute],
        },
        {
          id: 'not-found',
          path: '*',
          element: <NotFoundPage />,
          handle: { title: '页面不存在' },
        },
      ],
    },
  ];
}

export async function loadInitialRouteModules(pathname: string): Promise<InitialRouteModules> {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { home: await loadHomeRoute() };
  if (path === '/login') return { login: await loadLoginRoute() };
  if (path === '/docs') return { docs: await loadDocsRoute() };
  return {};
}
