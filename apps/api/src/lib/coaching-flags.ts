import type { UserProfile } from '@chefer/types';
import { env } from './env.js';
import { isFlagEnabled } from './flags.js';

// ─── Trainer coaching: who may use it (spec §11) ──────────────────────────────
// Kept apart from lib/coaching-middleware.ts so the access service can use it
// without an import cycle. Read the allowlists only through these functions.

/** `*` in an allowlist means everyone. */
function listed(allowlist: ReadonlySet<string> | undefined, email: string): boolean {
  // Takes the set as possibly undefined on purpose: a test that mocks lib/env.js
  // with a partial object must not crash here (the lib/flags.ts precedent).
  if (!allowlist) return false;
  return allowlist.has('*') || allowlist.has(email.trim().toLowerCase());
}

/**
 * Whether trainer coaching is on for this user: the `coaching` flag, or the user
 * is on COACHING_ALLOWLIST (dark launch). Code outside coaching.* / trainer.*
 * with a coaching branch (gym.bootstrap's `coaching` field) gates on this too,
 * so the kill switch stops everything at once.
 */
export function isCoachingEnabledFor(user: Pick<UserProfile, 'email'>): boolean {
  return isFlagEnabled('coaching') || listed(env.COACHING_ALLOWLIST, user.email);
}

/**
 * Whether the user may turn trainer tools on: coaching is on for them AND they
 * are on TRAINER_ALLOWLIST (Q-1: invite-only during the beta).
 */
export function canBeTrainer(user: Pick<UserProfile, 'email'>): boolean {
  return isCoachingEnabledFor(user) && listed(env.TRAINER_ALLOWLIST, user.email);
}
