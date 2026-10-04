import { useEffect, useSyncExternalStore } from 'react';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';

// ─── Device-local seen markers for the coaching notices (spec §2.6: no server state) ──
// - "Ana updated your routine · 2 Oct" stays on Gym Today until the client opens the routine.
// - "Ana stopped coaching you" can be dismissed (it also expires on the server after 30 days).

const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readSeen(): Record<string, string> {
  const raw = kv.getJSON(KV_KEYS.coachingRoutineSeen);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(raw)) if (typeof at === 'string') out[id] = at;
  return out;
}

/** Remember that the routine change made at `changedAt` has been looked at. */
export function markRoutineSeen(routineId: string, changedAt: string): void {
  const seen = readSeen();
  const current = seen[routineId];
  if (current !== undefined && Date.parse(current) >= Date.parse(changedAt)) return;
  // One routine at a time is enough: a new active routine replaces older markers.
  kv.setJSON(KV_KEYS.coachingRoutineSeen, { [routineId]: changedAt });
  emit();
}

/** True when the change made at `changedAt` has not been opened yet. */
export function isRoutineChangeUnseen(routineId: string, changedAt: string): boolean {
  const seen = readSeen()[routineId];
  return seen === undefined || Date.parse(seen) < Date.parse(changedAt);
}

/**
 * Called by the Routine tab: opening the routine counts as seeing the trainer's change.
 * Pass the routine's `lastEditedByOther.at` (null when nobody else changed it).
 */
export function useMarkRoutineSeen(routineId: string | null, changedAt: string | null): void {
  useEffect(() => {
    if (routineId !== null && changedAt !== null) markRoutineSeen(routineId, changedAt);
  }, [routineId, changedAt]);
}

/** Re-renders when a marker changes; returns nothing (read with the `is…` helpers). */
export function useSeenMarkersVersion(): string {
  return useSyncExternalStore(subscribe, () => JSON.stringify(readSeen()));
}

export function dismissedStoppedAt(): string | null {
  return kv.getString(KV_KEYS.coachingStoppedDismissed);
}

export function dismissStopped(at: string): void {
  kv.setString(KV_KEYS.coachingStoppedDismissed, at);
  emit();
}

export function useDismissedStoppedAt(): string | null {
  return useSyncExternalStore(subscribe, dismissedStoppedAt);
}
