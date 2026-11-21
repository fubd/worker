import type { RouteObject } from 'react-router';

import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import ErrorPage from './pages/ErrorPage';
import NotFoundPage from './pages/NotFoundPage';
import { loadTodosRoute } from './route-loaders';

function RouteFallback() {
  return null;
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    HydrateFallback: RouteFallback,
    children: [
      { index: true, element: <HomePage />, handle: { title: '概览' } },
      {
        path: 'todos',
        lazy: async () => {
          const route = await loadTodosRoute();
          return {
            Component: route.default,
            HydrateFallback: route.HydrateFallback,
            action: route.action,
            loader: route.loader,
          };
        },
        handle: { title: '待办 Demo' },
      },
      {
        path: 'about',
        lazy: async () => {
          const route = await import('./pages/AboutPage');
          return { Component: route.default };
        },
        handle: { title: '技术栈' },
      },
      { path: '*', element: <NotFoundPage />, handle: { title: '页面不存在' } },
    ],
  },
];
