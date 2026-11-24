export const loadHomeRoute = () => import('./pages/HomePage');
export const loadLoginRoute = () => import('./pages/LoginPage');
export const loadDocsRoute = () => import('./pages/DocsPage');
export const loadShareRoute = () =>
  import(/* webpackChunkName: "share-page" */ './pages/SharePage');
