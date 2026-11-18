import { Hono } from 'hono';
import { getStats } from '../db/todos';
import { readCachedStats, scheduleStatsCacheWrite, type CachedStats } from '../stats-cache';
import { measureDb } from '../timing';
import type { AppEnv } from '../types';

export const statsRoutes = new Hono<AppEnv>();

/** GET /api/stats —— 首页看板数据 */
statsRoutes.get('/', async (c) => {
  let stats: CachedStats | null = null;
  try {
    stats = await readCachedStats(c.req.url);
  } catch (error) {
    console.warn('[worker] stats cache read failed:', error);
  }

  if (stats) {
    c.set('cacheStatus', 'HIT');
  } else {
    c.set('cacheStatus', 'MISS');
    stats = await measureDb(c, () => getStats(c.env.DB));
    scheduleStatsCacheWrite(c, stats);
  }

  return c.json({
    ...stats,
    database: 'Cloudflare D1',
    region: c.req.header('cf-ray') ?? 'local',
    runtime: 'Cloudflare Workers',
  });
});
