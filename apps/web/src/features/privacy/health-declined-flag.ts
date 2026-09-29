// Whether the user answered "Don't save it" in this browser (UX-26). Drives the
// dashboard nudge only — never a consent record (the server's ConsentEvent log
// is that). Every read/write is guarded: storage can be blocked or throw.

const KEY = 'chefer.health-consent-declined';

export function getHealthConsentDeclined(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setHealthConsentDeclined(declined: boolean): void {
  try {
    if (declined) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the nudge simply won't persist.
  }
}
