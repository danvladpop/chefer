import { AppState, type AppStateStatus } from 'react-native';
import { env } from './env';

// ─── Mobile analytics transport (T-12.2, §5.10) ────────────────────────────────
// A pure-JS transport over PostHog's public HTTP capture endpoint — not the
// PostHog React Native SDK, which pulls native modules and would need a
// native rebuild. This is ~150 lines of JS: an in-memory queue, `fetch` and
// nothing else, so it ships over OTA and keeps the runtime fingerprint
// unchanged (T-39.5's fingerprint check covers the same constraint).
//
// No key configured (`EXPO_PUBLIC_POSTHOG_KEY` unset) = no-op: `enqueue`
// never queues anything and `fetch` is never called (AC3, tested with a
// mocked fetch in analytics.test.ts).

const BATCH_ENDPOINT_SUFFIX = '/batch/';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_LENGTH = 200; // drop the oldest rather than grow unbounded offline

export interface TransportEvent {
  event: string;
  properties: Record<string, unknown>;
  distinct_id: string;
  timestamp: string;
}

const enabled = Boolean(env.EXPO_PUBLIC_POSTHOG_KEY && env.EXPO_PUBLIC_POSTHOG_HOST);
const endpoint = env.EXPO_PUBLIC_POSTHOG_HOST
  ? `${env.EXPO_PUBLIC_POSTHOG_HOST}${BATCH_ENDPOINT_SUFFIX}`
  : null;

let queue: TransportEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** True only when a key AND the (EU-validated) host are both configured. */
export function isTransportEnabled(): boolean {
  return enabled;
}

/** Queues one event. A no-op — nothing is ever stored — when disabled. */
export function enqueue(event: TransportEvent): void {
  if (!enabled) return;
  queue.push(event);
  if (queue.length > MAX_QUEUE_LENGTH) queue = queue.slice(-MAX_QUEUE_LENGTH);
}

/** Sends and clears the queue. Never throws — a failed batch is dropped, not retried on top of new events. */
export async function flush(): Promise<void> {
  if (!enabled || !endpoint || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.EXPO_PUBLIC_POSTHOG_KEY, batch }),
    });
  } catch (err) {
    if (__DEV__) console.warn('[analytics] flush failed', err);
  }
}

/**
 * Drops every queued, unsent event. Called when the user turns counting off,
 * so events tracked before the opt-out never go out at the next flush (AC3).
 */
export function clearQueue(): void {
  queue = [];
}

let appStateSubscription: { remove: () => void } | null = null;

/** Starts the 30s timer and the background-flush listener. Call once at launch. */
export function startTransport(): void {
  if (!enabled || flushTimer) return;
  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  appStateSubscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'background' || status === 'inactive') void flush();
  });
}

/** Test/teardown seam — clears the timer, the listener and the queue. */
export function stopTransportForTests(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  queue = [];
}
