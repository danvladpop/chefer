import { KV_KEYS } from '../../gym/offline/keys';
import { kv } from '../../gym/offline/kv';

// ─── Pending household join (ADR 0002) ────────────────────────────────────────
// The household invite a signed-out visitor opened. Kept on this device (never sent anywhere) so the
// PendingJoinHost can reopen the join screen after sign-in or registration, even across a cold start.
// Cleared once the invite is answered (joined, "Not now", or a state that ends it) or reopened.

const JOIN_CODE = /^[0-9A-Za-z-]{1,40}$/;

export function rememberPendingHouseholdJoin(code: string): void {
  if (!JOIN_CODE.test(code)) return;
  kv.setString(KV_KEYS.householdPendingJoin, code);
}

export function readPendingHouseholdJoin(): string | null {
  const code = kv.getString(KV_KEYS.householdPendingJoin);
  return code !== null && JOIN_CODE.test(code) ? code : null;
}

export function clearPendingHouseholdJoin(): void {
  if (kv.getString(KV_KEYS.householdPendingJoin) === null) return;
  kv.remove(KV_KEYS.householdPendingJoin);
}

/** The route of the household join screen for an invite code (`chefer://household/join/<code>`). */
export function householdJoinHref(code: string): `/household/join/${string}` {
  return `/household/join/${encodeURIComponent(code)}`;
}
