import { TRPCError, type TRPCMiddlewareFunction } from '@trpc/server';
import type { UserProfile } from '@chefer/types';
import { env } from './env.js';
import { isFlagEnabled } from './flags.js';
import { protectedProcedure, type Context } from './trpc.js';

// ─── Kitchen progress: who sees it (docs/gamification-2026-10/tech-plan.md §4.3) ──
// The ledger records for every user (D1); this decides who SEES Kitchen
// progress: the `gamification` flag, or the user's email on
// GAMIFICATION_ALLOWLIST (`*` = everyone). Read the allowlist only here.

/** `*` in the allowlist means everyone. */
function listed(allowlist: ReadonlySet<string> | undefined, email: string): boolean {
  // Takes the set as possibly undefined on purpose: a test that mocks lib/env.js
  // with a partial object must not crash here (the lib/flags.ts precedent).
  if (!allowlist) return false;
  return allowlist.has('*') || allowlist.has(email.trim().toLowerCase());
}

export function isProgressEnabledFor(user: Pick<UserProfile, 'email'>): boolean {
  return isFlagEnabled('gamification') || listed(env.GAMIFICATION_ALLOWLIST, user.email);
}

export const PROGRESS_UNAVAILABLE_MESSAGE = 'Kitchen progress is not available yet.';

type AuthedOverrides = { user: UserProfile };

/** `FORBIDDEN` unless `isProgressEnabledFor(user)`. */
export const requireProgressEnabled: TRPCMiddlewareFunction<
  Context,
  object,
  AuthedOverrides,
  AuthedOverrides,
  unknown
> = ({ ctx, next }) => {
  if (!isProgressEnabledFor(ctx.user)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: PROGRESS_UNAVAILABLE_MESSAGE });
  }
  return next();
};

/** Every `progress.*` procedure except `availability` and `finishCook`. */
export const progressProcedure = protectedProcedure.use(requireProgressEnabled);
