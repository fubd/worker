/**
 * Browser API requests stay on deephos.com and Vercel proxies /api/* to the
 * Worker custom domain. Build and operational scripts still need the direct
 * upstream origin, especially when no Vercel server is available.
 */
export const API_UPSTREAM_ORIGIN = 'https://api.deephos.com';
export const API_PREFIX = '/api';

export function apiPath(path: string): string {
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

export function upstreamApiUrl(path: string): string {
  return `${API_UPSTREAM_ORIGIN}${apiPath(path)}`;
}
