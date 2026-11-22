import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';

import RootLayout from './layouts/RootLayout';
import ErrorPage from './pages/ErrorPage';
import NotFoundPage from './pages/NotFoundPage';
import { loadDocsRoute } from './route-loaders';

type DocsModule = typeof import('./pages/DocsPage');

export interface InitialRouteModules {
  docs?: DocsModule;
}

function RouteFallback() {
  return null;
}

export function createRoutes(initial: InitialRouteModules = {}): RouteObject[] {
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
      path: '/',
      element: <RootLayout />,
      errorElement: <ErrorPage />,
      HydrateFallback: RouteFallback,
      children: [
        { id: 'home', index: true, element: <Navigate to="/docs" replace /> },
        docsRoute,
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
  return {};
}
