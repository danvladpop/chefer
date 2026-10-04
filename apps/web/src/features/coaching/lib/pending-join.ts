// A client who still needs gym setup leaves the join page for /gym/setup. The
// code is kept on this device (never sent anywhere) so Gym Today can offer to
// carry on joining afterwards.

const KEY = 'chefer.coaching.pendingJoin';

export function rememberPendingJoin(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Storage blocked: the invite link still works when opened again.
  }
}

export function readPendingJoin(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingJoin(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
