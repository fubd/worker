import type { Context } from 'hono';
import type { AppEnv } from './types';

export async function measureDb<T>(c: Context<AppEnv>, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    c.set('dbMs', c.get('dbMs') + (performance.now() - startedAt));
  }
}
