import { randomUUID } from 'expo-crypto';
import type { EventMap } from '@chefer/types';
import { kv } from '../features/gym/offline/kv';
import { enqueue, isTransportEnabled, startTransport } from './analytics-transport';

// ─── Mobile analytics wrapper (T-12.2, T-12.3, §5.10) ──────────────────────────
// `track<E extends keyof EventMap>` is the typed entry point every mobile
// call site uses (`src/features/gym/analytics.ts` re-exports through it).
// Consent model (Q-8 default, until counsel/product says otherwise):
//   - "Send anonymous usage counts": default ON. An in-memory session id,
//     generated once per cold start here at module load and NEVER written to
//     storage, stands in for the anonymous distinct_id (AC1).
//   - "Link usage to my account": default OFF, opt-in. While off, nothing is
//     tied to the account even when signed in (AC2). Turning "anonymous" off
//     also turns "linked" off and stops every network call (AC3).
// The consent CHOICE itself (not events) is the only thing persisted, in a
// small local KV entry — see CONSENT_KEY below.

/** Local storage key for the two switches. NOT part of the gym feature's
 * `KV_KEYS` registry (`src/features/gym/offline/keys.ts`) — that file isn't
 * owned by this lane. Uses the same underlying `kv` helper (dedicated SQLite
 * KV store), just under its own key. See the L-DATA handoff note in the PR
 * description: promoting this into `KV_KEYS` is a natural follow-up once
 * that file's owner reviews it. */
const CONSENT_KEY = 'analytics.consent';

export interface AnalyticsConsent {
  anonymous: boolean;
  linked: boolean;
}

/** Q-8 default: anonymous counting on, linking to the account opt-in. */
const DEFAULT_CONSENT: AnalyticsConsent = { anonymous: true, linked: false };

function isConsent(value: unknown): value is AnalyticsConsent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AnalyticsConsent>).anonymous === 'boolean' &&
    typeof (value as Partial<AnalyticsConsent>).linked === 'boolean'
  );
}

function readStoredConsent(): AnalyticsConsent {
  const raw = kv.getJSON(CONSENT_KEY);
  return isConsent(raw) ? raw : DEFAULT_CONSENT;
}

let consent: AnalyticsConsent = readStoredConsent();
/** Random per cold start, never persisted (AC1) — the module re-evaluates this on every launch. */
const sessionId = randomUUID();
let linkedUserId: string | null = null;

const DEBUG_RING_SIZE = 50;
interface DebugEvent {
  event: string;
  properties: Record<string, unknown>;
  at: string;
}
const debugRing: DebugEvent[] = [];

/** Call once from `app/_layout.tsx`. Starts the transport's flush timer. */
export function initAnalytics(): void {
  startTransport();
}

export function getAnalyticsConsent(): AnalyticsConsent {
  return consent;
}

/**
 * Updates one or both switches, persists the choice, and applies it at once
 * (AC2 — a link change takes effect on the very next `track()` call, an
 * anonymous-off change stops all network activity immediately).
 */
export function setAnalyticsConsent(next: Partial<AnalyticsConsent>): AnalyticsConsent {
  const merged = { ...consent, ...next };
  // Turning anonymous counting off disables linking too — "sends nothing at
  // all" per the design (§ Flow & states).
  consent = merged.anonymous ? merged : { anonymous: false, linked: false };
  kv.setJSON(CONSENT_KEY, consent);
  return consent;
}

/** Called when the session resolves. Linking only takes effect if `consent.linked` is also true. */
export function setCurrentUserId(userId: string | null): void {
  linkedUserId = userId;
}

/** Sign-out: "sign-out resets link to off" — the next session starts unlinked. */
export function resetAnalyticsOnSignOut(): void {
  linkedUserId = null;
  if (consent.linked) setAnalyticsConsent({ linked: false });
}

/**
 * The typed entry point every mobile call site uses. Overloaded like web's
 * `capture()` (`apps/web/src/lib/analytics.ts`): an `EventMap` key gets its
 * exact, health-data-guarded property shape checked; any other event name —
 * today, the pre-existing per-app `GymEventMap`
 * (`src/features/gym/analytics.ts`) — keeps the permissive shape so that
 * re-export doesn't require migrating its 11 events onto this map in the
 * same change.
 */
export function track<E extends keyof EventMap>(event: E, properties: EventMap[E]): void;
export function track(event: string, properties: Record<string, unknown>): void;
export function track(event: string, properties: Record<string, unknown>): void {
  if (__DEV__) {
    debugRing.push({ event, properties, at: new Date().toISOString() });
    if (debugRing.length > DEBUG_RING_SIZE) debugRing.shift();
  }
  // AC3: anonymous off => zero network calls, not even a queued event.
  if (!consent.anonymous) return;
  const distinctId = consent.linked && linkedUserId ? linkedUserId : sessionId;
  enqueue({
    event,
    properties,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
  });
}

/** Settings › About "Analytics debug" list (§5.10, `__DEV__` only). */
export function getDebugEvents(): DebugEvent[] {
  return [...debugRing];
}

/** Test seam: the in-memory, per-cold-start anonymous id (AC1). */
export function getSessionIdForTests(): string {
  return sessionId;
}

export { isTransportEnabled };
