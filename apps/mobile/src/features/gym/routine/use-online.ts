import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// Editing a routine needs a connection in v1 (gym_plan.md §5.4). Backed by
// the same NetInfo-fed onlineManager the rest of the gym offline layer uses
// (connectivity.ts), so this agrees with the outbox's view of connectivity.
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(() => onStoreChange()),
    () => onlineManager.isOnline(),
    () => true,
  );
}
