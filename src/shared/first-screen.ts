import type { TodoStats } from './types';

/**
 * Placeholder dashboard values shared by the build-time first-screen snapshot
 * and the app's initial state.
 *
 * The snapshot is captured from a local server that returns these values, so
 * the static page and the app's first render are visually identical. Starting
 * the app with the same values means the snapshot does not have to wait for
 * /api/stats before handing over: React can render the dashboard immediately,
 * and the real values replace the placeholders when the request completes.
 */
export const FIRST_SCREEN_STATS: TodoStats = {
  total: 2,
  completed: 0,
  active: 2,
  completionRate: 0,
  database: 'Cloudflare D1',
  runtime: 'Cloudflare Workers',
  // Placeholder cf-ray id. A hex-shaped value avoids an obvious width change
  // when the real value arrives.
  region: 'a58e4f19f9bd2ab6',
};
