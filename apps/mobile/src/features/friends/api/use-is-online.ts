import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// The same "online" signal queries and the gym outbox use (fed by NetInfo in
// gym/offline/connectivity.ts). A local copy, as the other features keep
// theirs, so Following doesn't import another lane's file. UX §5.2 Offline:
// relation buttons, Accept/Decline and search are disabled while offline.
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const getSnapshot = () => onlineManager.isOnline();

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
