import type { TodoStats } from './types';

/**
 * Values rendered before the live dashboard request completes. Static builds
 * and the browser's first render use the same object, so hydration is stable.
 */
export const PLACEHOLDER_STATS: TodoStats = {
  total: 2,
  completed: 0,
  active: 2,
  completionRate: 0,
  database: 'Cloudflare D1',
  runtime: 'Cloudflare Workers',
  region: 'a58e4f19f9bd2ab6',
};
