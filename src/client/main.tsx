import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import 'antd/dist/reset.css';
import './styles/global.css';

import { AppProviders } from './app-providers';
import { router } from './router';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 #root 挂载节点');
}
const rootElement = container;

const app = (
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);

// The build-time DOM is a paint snapshot. Client-side data loading and actions
// are the source of truth after React takes over.
rootElement.replaceChildren();
createRoot(rootElement).render(app);
