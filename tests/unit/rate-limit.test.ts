import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createRateLimiter } = require('../../src/lib/rate-limit.cjs');

describe('createRateLimiter', () => {
  it('blocks requests after threshold inside the same window', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });

    expect(limiter('ip-1', 1000)).toBe(false);
    expect(limiter('ip-1', 1100)).toBe(false);
    expect(limiter('ip-1', 1200)).toBe(true);
  });

  it('resets after time window passes', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });

    expect(limiter('ip-1', 1000)).toBe(false);
    expect(limiter('ip-1', 1100)).toBe(false);
    expect(limiter('ip-1', 2300)).toBe(false);
  });

  it('prunes stale buckets to avoid unbounded growth', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 100, maxBuckets: 3, pruneEvery: 1 });

    expect(limiter('ip-1', 0)).toBe(false);
    expect(limiter('ip-2', 0)).toBe(false);
    expect(limiter('ip-3', 0)).toBe(false);
    expect(limiter.getBucketCount()).toBe(3);

    expect(limiter('ip-4', 500)).toBe(false);
    expect(limiter.getBucketCount()).toBeLessThanOrEqual(3);
  });
});
