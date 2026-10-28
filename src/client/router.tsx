import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import ErrorPage from './pages/ErrorPage';

// 首屏（概览）打进主包；其余路由按需加载，减小初始 JS
const TodosPage = lazy(() => import('./pages/TodosPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // 路由级错误边界：任一子路由渲染抛错不会白屏
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
