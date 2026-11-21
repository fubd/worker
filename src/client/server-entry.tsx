import { renderToString } from 'react-dom/server';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';

import { AppProviders } from './app-providers';
import { createRoutes } from './routes';
import { setTodosSnapshotForStaticRender } from './pages/TodosPage';
import type { TodoListSnapshot } from '@/shared/types';

type RenderOptions = {
  path: string;
  todosSnapshot?: TodoListSnapshot | null;
};

export async function renderStaticRoute({ path, todosSnapshot }: RenderOptions) {
  setTodosSnapshotForStaticRender(todosSnapshot ?? null);

  const routes = createRoutes({
    docs: await import('./pages/DocsPage'),
    todos: await import('./pages/TodosPage'),
    about: await import('./pages/AboutPage'),
  });
  const cache = createCache();
  const { query, dataRoutes } = createStaticHandler(routes);
  const request = new Request(new URL(path, 'https://deephos.com'));
  const context = await query(request);

  if (context instanceof Response) {
    throw new Error(`Static render for ${path} unexpectedly returned HTTP ${context.status}`);
  }

  const router = createStaticRouter(dataRoutes, context);
  const rendered = renderToString(
    <StyleProvider cache={cache}>
      <AppProviders>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppProviders>
    </StyleProvider>,
  );

  return {
    html: rendered,
    styles: extractStyle(cache, { types: ['style', 'token', 'cssVar'] }),
    hydrationData: {
      loaderData: context.loaderData,
      actionData: context.actionData,
    },
  };
}
