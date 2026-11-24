import { describe, expect, test } from 'bun:test';

import { nextRateLimitState } from '../../src/worker/rate-limit';

const policy = {
  limit: 2,
  windowMs: 60_000,
  blockMs: 30_000,
};

describe('rate limit state', () => {
  test('counts requests inside the window', () => {
    expect(nextRateLimitState(null, policy, 1_000)).toEqual({
      attempts: 1,
      windowStartedAt: 1_000,
      blockedUntil: 0,
    });
    expect(
      nextRateLimitState({ attempts: 1, windowStartedAt: 1_000, blockedUntil: 0 }, policy, 2_000),
    ).toEqual({ attempts: 2, windowStartedAt: 1_000, blockedUntil: 0 });
  });

  test('blocks requests over the limit', () => {
    expect(
      nextRateLimitState({ attempts: 2, windowStartedAt: 1_000, blockedUntil: 0 }, policy, 3_000),
    ).toEqual({ attempts: 3, windowStartedAt: 1_000, blockedUntil: 33_000 });
  });

  test('keeps an active block and resets after the window', () => {
    const blocked = { attempts: 3, windowStartedAt: 1_000, blockedUntil: 33_000 };
    expect(nextRateLimitState(blocked, policy, 10_000)).toEqual(blocked);
    expect(nextRateLimitState(blocked, policy, 61_001)).toEqual({
      attempts: 1,
      windowStartedAt: 61_001,
      blockedUntil: 0,
    });
  });
});
