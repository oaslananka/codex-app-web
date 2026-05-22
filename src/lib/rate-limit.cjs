'use strict';

function pruneBuckets(buckets, now, maxBuckets) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size > maxBuckets) {
    const oldestKey = buckets.keys().next().value;
    if (!oldestKey) {
      break;
    }
    buckets.delete(oldestKey);
  }
}

function createRateLimiter({ max, windowMs, maxBuckets = 5000, pruneEvery = 256 }) {
  const buckets = new Map();
  let operationCount = 0;

  function isRateLimited(key, now = Date.now()) {
    const id = key || 'unknown';
    const current = buckets.get(id);

    if (!current || current.resetAt <= now) {
      buckets.delete(id);
      buckets.set(id, { count: 1, resetAt: now + windowMs });
    } else if (current.count >= max) {
      buckets.delete(id);
      buckets.set(id, current);
      operationCount += 1;
      if (operationCount % pruneEvery === 0 || buckets.size > maxBuckets) {
        pruneBuckets(buckets, now, maxBuckets);
      }
      return true;
    } else {
      current.count += 1;
      buckets.delete(id);
      buckets.set(id, current);
    }

    operationCount += 1;
    if (operationCount % pruneEvery === 0 || buckets.size > maxBuckets) {
      pruneBuckets(buckets, now, maxBuckets);
    }
    return false;
  }

  isRateLimited.getBucketCount = () => buckets.size;

  return isRateLimited;
}

module.exports = { createRateLimiter };
