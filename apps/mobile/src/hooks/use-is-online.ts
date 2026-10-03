import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

/** Whether the device is online, as TanStack's `onlineManager` (fed by NetInfo) sees it. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
