import type { Context } from 'hono';
import type { TodoStats } from '../shared/types';
import type { AppEnv } from './types';

export type CachedStats = Omit<TodoStats, 'database' | 'region' | 'runtime'>;

const STATS_CACHE_TTL_SECONDS = 30;
const STATS_CACHE_PATH = '/__swan_cache/stats/v1';

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

function edgeCache(): EdgeCache {
  return (caches as unknown as { default: EdgeCache }).default;
}

function statsCacheKey(requestUrl: string): Request {
  const origin = new URL(requestUrl).origin;
  return new Request(`${origin}${STATS_CACHE_PATH}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
}

export async function readCachedStats(requestUrl: string): Promise<CachedStats | null> {
  const response = await edgeCache().match(statsCacheKey(requestUrl));
  if (!response) return null;

  try {
    return (await response.json()) as CachedStats;
  } catch {
    return null;
  }
}

export function scheduleStatsCacheWrite(c: Context<AppEnv>, stats: CachedStats): void {
  const response = new Response(JSON.stringify(stats), {
    headers: {
      'Cache-Control': `public, max-age=${STATS_CACHE_TTL_SECONDS}`,
      'Content-Type': 'application/json',
    },
  });
  const write = edgeCache()
    .put(statsCacheKey(c.req.url), response)
    .catch((error: unknown) => console.warn('[worker] stats cache write failed:', error));
  c.executionCtx.waitUntil(write);
}

export function invalidateStatsCache(c: Context<AppEnv>): void {
  const deletion = edgeCache()
    .delete(statsCacheKey(c.req.url))
    .catch((error: unknown) => console.warn('[worker] stats cache invalidation failed:', error));
  c.executionCtx.waitUntil(deletion);
}
