import { createBrowserRouter } from 'react-router';

import { routes } from './routes';

// React Router reads window.__staticRouterHydrationData when present, so the
// same route table hydrates static pages and powers normal client navigation.
export const router = createBrowserRouter(routes);
