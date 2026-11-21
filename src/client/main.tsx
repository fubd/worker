import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import 'antd/dist/reset.css';
import './styles/global.css';

import { AppProviders } from './app-providers';
import { createAppRouter } from './router';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 #root 挂载节点');
}
const rootElement = container;
const router = await createAppRouter();

const app = (
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);

// Reuse the build-time DOM and the server-generated Ant Design styles. Rendering
// a separate client root makes CSS-in-JS replace those styles after first paint.
hydrateRoot(rootElement, app);
