import { createBrowserRouter } from 'react-router';

import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import TodosPage from './pages/TodosPage';
import AboutPage from './pages/AboutPage';
import NotFoundPage from './pages/NotFoundPage';
import ErrorPage from './pages/ErrorPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // 路由级错误边界：任一子路由渲染抛错时不会白屏
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
