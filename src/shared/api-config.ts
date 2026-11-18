/**
 * Production API is served by the Worker custom domain.  Keeping this value
 * shared between the browser client and build scripts prevents the shell
 * prefetch from taking a different route than interactive API calls.
 */
export const API_ORIGIN = 'https://api.deephos.com';
export const API_PREFIX = '/api';

export function apiPath(path: string): string {
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

export function productionApiUrl(path: string): string {
  return `${API_ORIGIN}${apiPath(path)}`;
}
