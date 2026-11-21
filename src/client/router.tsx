import { createBrowserRouter } from 'react-router';

import { createRoutes, loadInitialRouteModules } from './routes';

// React Router reads window.__staticRouterHydrationData when present, so the
// same route table hydrates static pages and powers normal client navigation.
export async function createAppRouter() {
  const initial = await loadInitialRouteModules(window.location.pathname);
  return createBrowserRouter(createRoutes(initial));
}
