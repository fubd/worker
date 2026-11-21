import type { RouteObject } from 'react-router';

import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import ErrorPage from './pages/ErrorPage';
import NotFoundPage from './pages/NotFoundPage';
import { loadDocsRoute, loadTodosRoute } from './route-loaders';

type DocsModule = typeof import('./pages/DocsPage');
type TodosModule = typeof import('./pages/TodosPage');
type AboutModule = typeof import('./pages/AboutPage');

export interface InitialRouteModules {
  docs?: DocsModule;
  todos?: TodosModule;
  about?: AboutModule;
}

function RouteFallback() {
  return null;
}

export function createRoutes(initial: InitialRouteModules = {}): RouteObject[] {
  const docsRoute: RouteObject = {
    id: 'docs',
    path: 'docs',
    handle: { title: '文档' },
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

  const todosRoute: RouteObject = {
    id: 'todos',
    path: 'todos',
    handle: { title: '待办 Demo' },
    ...(initial.todos
      ? {
          Component: initial.todos.default,
          HydrateFallback: initial.todos.HydrateFallback,
          action: initial.todos.action,
          loader: initial.todos.loader,
        }
      : {
          lazy: async () => {
            const route = await loadTodosRoute();
            return {
              Component: route.default,
              HydrateFallback: route.HydrateFallback,
              action: route.action,
              loader: route.loader,
            };
          },
        }),
  };

  const aboutRoute: RouteObject = {
    id: 'about',
    path: 'about',
    handle: { title: '技术栈' },
    ...(initial.about
      ? { Component: initial.about.default }
      : {
          lazy: async () => {
            const route = await import('./pages/AboutPage');
            return { Component: route.default };
          },
        }),
  };

  return [
    {
      id: 'root',
      path: '/',
      element: <RootLayout />,
      errorElement: <ErrorPage />,
      HydrateFallback: RouteFallback,
      children: [
        { id: 'home', index: true, element: <HomePage />, handle: { title: '概览' } },
        docsRoute,
        todosRoute,
        aboutRoute,
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
  if (pathname === '/docs') return { docs: await loadDocsRoute() };
  if (pathname === '/todos') return { todos: await loadTodosRoute() };
  if (pathname === '/about') return { about: await import('./pages/AboutPage') };
  return {};
}
