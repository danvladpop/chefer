import { useSyncExternalStore } from 'react';
import type { PremiumSource } from '@chefer/types';

// ─── openPremium(source) — the one way to offer Premium (T-10.2, PAT-3) ────────
// Every lock, nudge and the Profile plan section calls this with the `source`
// it lives in; the premium sheet (premium-host.tsx) opens headlined by the job
// that source unlocks. It replaces the seven `router.push('/profile', {
// source })` call sites — the offer now appears where the user is, not on
// another screen, and their in-progress work (a pasted link) survives.
//
// A plain function + a tiny external store, so non-component code (the
// ingredient upsell, an onPress) can call it. `PremiumHost` renders the
// sheet; the root layout mounts one, and a Sheet that can open Premium mounts
// its own nested host (iOS cannot present a Modal over a Modal — the sheet
// renders in the most recently mounted host, the same pattern as
// AiConsentHost).

export type PremiumSourceInput = PremiumSource | (string & {});

interface StoreState {
  /** The source the sheet is open for; null = closed. */
  source: string | null;
  /** Mounted hosts, oldest first — the last one renders the sheet. */
  hosts: string[];
}

let state: StoreState = { source: null, hosts: [] };
const listeners = new Set<() => void>();

function setState(next: StoreState): void {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePremiumStore(): StoreState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Registers a mounted host; returns its unregister. */
export function registerPremiumHost(id: string): () => void {
  setState({ ...state, hosts: [...state.hosts.filter((h) => h !== id), id] });
  return () => setState({ ...state, hosts: state.hosts.filter((h) => h !== id) });
}

export function hasPremiumHost(): boolean {
  return state.hosts.length > 0;
}

/**
 * Opens the premium sheet for `source`. The root layout always mounts a host;
 * with none mounted (a bare test harness) there is nothing to render, so the
 * call is a no-op and says so in development.
 */
export function openPremium(source: PremiumSourceInput): void {
  if (!hasPremiumHost()) {
    if (__DEV__) console.warn(`[premium] openPremium('${source}') with no <PremiumHost /> mounted`);
    return;
  }
  setState({ ...state, source });
}

export function closePremium(): void {
  if (state.source !== null) setState({ ...state, source: null });
}

/** Test seam. */
export function resetPremiumStoreForTests(): void {
  listeners.clear();
  state = { source: null, hosts: [] };
}
