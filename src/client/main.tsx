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

function waitForFirstReactCommit(element: HTMLElement) {
  if (element.childNodes.length > 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (element.childNodes.length === 0) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(element, { childList: true });
  });
}

const reactRootElement = document.createElement('div');
reactRootElement.id = 'root';
reactRootElement.hidden = true;
const rootParent = rootElement.parentNode;
if (!rootParent) {
  throw new Error('找不到 #root 的父节点');
}
rootParent.insertBefore(reactRootElement, rootElement.nextSibling);

// Start React immediately so route, React, and Ant Design work stays split
// across tasks. Render the matching fallback in a hidden sibling first, then
// swap it in after the first commit so the build-time snapshot never disappears.
const firstCommit = waitForFirstReactCommit(reactRootElement);
createRoot(reactRootElement).render(app);
void firstCommit.then(() => {
  reactRootElement.hidden = false;
  rootParent.replaceChild(reactRootElement, rootElement);
});
