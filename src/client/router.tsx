import { createBrowserRouter } from 'react-router';

import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import ErrorPage from './pages/ErrorPage';
import NotFoundPage from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // 路由级错误边界：任一子路由渲染抛错不会白屏
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage />, handle: { title: '概览' } },
      {
        path: 'todos',
        lazy: async () => {
          const route = await import('./pages/TodosPage');
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
]);
