import type { MiddlewareHandler } from 'hono';

import {
  API_READS_PER_MINUTE,
  API_WRITES_PER_MINUTE,
  ATTACHMENT_UPLOADS_PER_MINUTE,
  DOCUMENT_CREATES_PER_MINUTE,
  PUBLIC_READS_PER_MINUTE,
} from '../shared/limits';
import { hashRateLimitKey } from './auth/password';
import { getPasswordRateLimit } from './db/auth';
import type { AppEnv } from './types';

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
  blockMs: number;
}

export interface RateLimitState {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function nextRateLimitState(
  current: RateLimitState | null,
  policy: Pick<RateLimitPolicy, 'limit' | 'windowMs' | 'blockMs'>,
  now: number,
): RateLimitState {
  if (current && current.blockedUntil > now) return current;

  const windowExpired = !current || now - current.windowStartedAt >= policy.windowMs;
  const attempts = windowExpired ? 1 : current.attempts + 1;
  const windowStartedAt = windowExpired ? now : current.windowStartedAt;
  return {
    attempts,
    windowStartedAt,
    blockedUntil: attempts > policy.limit ? now + policy.blockMs : 0,
  };
}

async function consumeRateLimit(
  db: D1Database,
  subject: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<RateLimitResult> {
  const key = await hashRateLimitKey(`${policy.key}:${subject}`);
  const current = await getPasswordRateLimit(db, key);

  const next = nextRateLimitState(current, policy, now);
  if (next === current && current && current.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1_000)),
    };
  }

  await db
    .prepare(
      `INSERT INTO auth_rate_limits (key, attempts, window_started_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         attempts = excluded.attempts,
         window_started_at = excluded.window_started_at,
         blocked_until = excluded.blocked_until`,
    )
    .bind(key, next.attempts, next.windowStartedAt, next.blockedUntil)
    .run();

  return {
    allowed: next.blockedUntil === 0,
    retryAfterSeconds: next.blockedUntil ? Math.ceil(policy.blockMs / 1_000) : 0,
  };
}

function createRateLimitMiddleware(
  policy: Omit<RateLimitPolicy, 'key'> & { name: string },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = await consumeRateLimit(c.env.DB, `user:${c.get('user').id}`, {
      key: policy.name,
      limit: policy.limit,
      windowMs: policy.windowMs,
      blockMs: policy.blockMs,
    });

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSeconds));
      return c.json(
        { error: '请求过于频繁，请稍后再试', retryAfter: result.retryAfterSeconds },
        429,
      );
    }

    await next();
  };
}

function createPublicRateLimitMiddleware(
  policy: Omit<RateLimitPolicy, 'key'> & { name: string },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const clientIp =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const result = await consumeRateLimit(c.env.DB, `ip:${clientIp}`, {
      key: policy.name,
      limit: policy.limit,
      windowMs: policy.windowMs,
      blockMs: policy.blockMs,
    });

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSeconds));
      return c.json(
        { error: '请求过于频繁，请稍后再试', retryAfter: result.retryAfterSeconds },
        429,
      );
    }

    await next();
  };
}

export const apiRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const write = c.req.method !== 'GET' && c.req.method !== 'HEAD';
  const middleware = createRateLimitMiddleware({
    name: write ? 'api:write' : 'api:read',
    limit: write ? API_WRITES_PER_MINUTE : API_READS_PER_MINUTE,
    windowMs: 60_000,
    blockMs: 60_000,
  });
  return middleware(c, next);
};

export const documentCreateRateLimit = createRateLimitMiddleware({
  name: 'documents:create',
  limit: DOCUMENT_CREATES_PER_MINUTE,
  windowMs: 60_000,
  blockMs: 60_000,
});

export const attachmentUploadRateLimit = createRateLimitMiddleware({
  name: 'attachments:upload',
  limit: ATTACHMENT_UPLOADS_PER_MINUTE,
  windowMs: 60_000,
  blockMs: 60_000,
});

export const publicShareRateLimit = createPublicRateLimitMiddleware({
  name: 'shares:read',
  limit: PUBLIC_READS_PER_MINUTE,
  windowMs: 60_000,
  blockMs: 60_000,
});
