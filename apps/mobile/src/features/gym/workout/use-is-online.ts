import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// TanStack's onlineManager is fed by NetInfo (offline/connectivity.ts), so
// this is the same "online" the outbox and queries use.
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const getSnapshot = () => onlineManager.isOnline();

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
