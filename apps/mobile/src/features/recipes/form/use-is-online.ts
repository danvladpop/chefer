import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// Same "online" signal the outbox and queries use (fed by NetInfo via
// offline/connectivity.ts) — a small local copy rather than importing
// gym's own `use-is-online.ts` (L-GYM's file, per the lane ownership map).
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const getSnapshot = () => onlineManager.isOnline();

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
