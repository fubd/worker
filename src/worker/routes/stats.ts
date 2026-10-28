import { Hono } from 'hono';
import { getStats } from '../db/todos';
import type { AppEnv } from '../types';

export const statsRoutes = new Hono<AppEnv>();

/** GET /api/stats —— 首页看板数据 */
statsRoutes.get('/', async (c) => {
  const stats = await getStats(c.env.DB);
  return c.json({
    ...stats,
    database: 'Cloudflare D1',
    region: c.req.header('cf-ray') ?? 'local',
    runtime: 'Cloudflare Workers',
  });
});
