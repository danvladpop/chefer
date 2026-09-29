import { useSyncExternalStore } from 'react';
import { createExternalStore } from '../gym/offline/external-store';
import { kv } from '../gym/offline/kv';

// Whether the user answered "Don't save it" on this device (UX-26). Drives the
// Food Today nudge only — never a consent record (that is the server's
// ConsentEvent log). Device-level, like the landing cache.

const DECLINED_KEY = 'privacy.health-consent-declined';

const declinedStore = createExternalStore<boolean>(() => kv.getString(DECLINED_KEY) === '1');

export function setHealthConsentDeclined(declined: boolean): void {
  if (declined) kv.setString(DECLINED_KEY, '1');
  else kv.remove(DECLINED_KEY);
  declinedStore.set(declined);
}

export function useHealthConsentDeclined(): boolean {
  return useSyncExternalStore(declinedStore.subscribe, declinedStore.get, declinedStore.get);
}
