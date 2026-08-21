import { TRPCError } from '@trpc/server';

// ─── In-memory sliding-window limiter ─────────────────────────────────────────
// Single-process API (one container, no horizontal scaling), so an in-memory
// store is correct today. If the API ever runs more than one instance, move
// the buckets to Redis — REDIS_URL is already in the env schema.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Periodically drop buckets whose entries have all expired. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}

/**
 * Records a hit for `key` and returns whether it is allowed under
 * `max` hits per `windowMs`. Pure sliding window: old hits expire
 * individually rather than in fixed intervals.
 */
export function consume(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  sweep(now, windowMs);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= max) return false;
  bucket.timestamps.push(now);
  return true;
}

/** Test hook — clears all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Guard for tRPC procedures: throws TOO_MANY_REQUESTS when `key` exceeds
 * `max` hits per `windowMs`. Keyed by caller (IP or user ID) + a name so
 * different procedures don't share buckets.
 */
export function assertWithinRateLimit(
  name: string,
  key: string,
  max: number,
  windowMs: number,
): void {
  if (!consume(`${name}:${key}`, max, windowMs)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    });
  }
}
