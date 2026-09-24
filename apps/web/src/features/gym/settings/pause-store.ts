import { getStorage, GYM_KEYS, readJson } from '../workout/storage';

// Pauses created from this browser, so "End pause" knows the id. The
// bootstrap reports a paused week but not the pause id (API gap, see the G5
// handoff), so a pause started on the phone can't be ended from the web yet.

export interface KnownPause {
  id: string;
  ownerId: string;
  startDate: string;
  endDate: string;
}

function readAll(): KnownPause[] {
  const value = readJson(getStorage(), GYM_KEYS.pauses);
  return Array.isArray(value)
    ? value.filter(
        (p): p is KnownPause =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as KnownPause).id === 'string' &&
          typeof (p as KnownPause).ownerId === 'string' &&
          typeof (p as KnownPause).endDate === 'string',
      )
    : [];
}

/** The owner's pause that covers `today`, if one was created here. */
export function activePause(ownerId: string | null, today: string): KnownPause | null {
  if (!ownerId) return null;
  return (
    readAll().find((p) => p.ownerId === ownerId && p.startDate <= today && today <= p.endDate) ??
    null
  );
}

export function rememberPause(pause: KnownPause): void {
  const kept = readAll().filter((p) => p.id !== pause.id);
  getStorage().setItem(GYM_KEYS.pauses, JSON.stringify([...kept, pause].slice(-10)));
}

export function forgetPause(id: string): void {
  getStorage().setItem(GYM_KEYS.pauses, JSON.stringify(readAll().filter((p) => p.id !== id)));
}
