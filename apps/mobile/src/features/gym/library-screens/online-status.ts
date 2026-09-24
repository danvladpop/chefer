import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

// Small reactive wrapper over TanStack Query's onlineManager (itself fed by
// NetInfo — see offline/connectivity.ts). Gym screens use this to decide
// between the offline-cached bootstrap and a fresher API call, and to gate
// online-only actions (the YouTube embed, custom-exercise mutations).
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(() => setOnline(onlineManager.isOnline())), []);

  return online;
}
