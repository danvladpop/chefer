import { TRPCError, type TRPCMiddlewareFunction } from '@trpc/server';
import type { TrainerProfile } from '@chefer/database';
import { clientIdInputSchema, type UserProfile } from '@chefer/types';
import {
  CoachingAccessMemo,
  coachingAccessService,
  type CoachingAccess,
  type CoachingScope,
} from '../application/coaching/coaching-access.service.js';
import { coachingUnavailableError, trainerToolsOffError } from './coaching-errors.js';
import { isCoachingEnabledFor } from './coaching-flags.js';
import { protectedProcedure, type Context } from './trpc.js';

// ─── Trainer coaching: middleware and base procedures (spec §7.1) ─────────────
//
//   coachingProcedure                          flag (or COACHING_ALLOWLIST) on
//   trainerProcedure                           + the caller has an active TrainerProfile
//   trainerProcedure
//     .use(requireCoachingAccess(scope))       + an ACTIVE link to `input.clientId`
//
// Context gained along the way:
//   ctx.trainerProfile   the caller's TrainerProfile          (trainerProcedure)
//   ctx.coachingMemo     the per-request access memo          (trainerProcedure)
//   ctx.coachingAccess   the resolved access                  (requireCoachingAccess)

type AuthedOverrides = { user: UserProfile };
type TrainerOverrides = AuthedOverrides & {
  trainerProfile: TrainerProfile;
  coachingMemo: CoachingAccessMemo;
};

/** NOT_FOUND unless `isCoachingEnabledFor(user)`. */
export const requireCoachingEnabled: TRPCMiddlewareFunction<
  Context,
  object,
  AuthedOverrides,
  AuthedOverrides,
  unknown
> = ({ ctx, next }) => {
  if (!isCoachingEnabledFor(ctx.user)) throw coachingUnavailableError();
  return next();
};

/** FORBIDDEN `reason: 'TRAINER_TOOLS_OFF'` unless the caller has an active TrainerProfile. */
export const requireActiveTrainer: TRPCMiddlewareFunction<
  Context,
  object,
  AuthedOverrides,
  { trainerProfile: TrainerProfile; coachingMemo: CoachingAccessMemo },
  unknown
> = async ({ ctx, next }) => {
  const coachingMemo = new CoachingAccessMemo();
  const trainerProfile = await coachingAccessService.trainerProfile(ctx.user.id, coachingMemo);
  if (!trainerProfile) throw trainerToolsOffError();
  return next({ ctx: { trainerProfile, coachingMemo } });
};

/**
 * Resolves `CoachingAccessService.assert(...)` into `ctx.coachingAccess`. One
 * NOT_FOUND "This client isn't available" for every denial; a missing or
 * malformed `clientId` is a BAD_REQUEST, same as the input parser would give.
 */
export function requireCoachingAccess(
  scope: CoachingScope,
): TRPCMiddlewareFunction<
  Context,
  object,
  TrainerOverrides,
  { coachingAccess: CoachingAccess },
  unknown
> {
  return async ({ ctx, next, getRawInput }) => {
    const parsed = clientIdInputSchema.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid client.', cause: parsed.error });
    }
    const coachingAccess = await coachingAccessService.assert(
      { id: ctx.user.id, email: ctx.user.email },
      parsed.data.clientId,
      scope,
      ctx.coachingMemo,
    );
    return next({ ctx: { coachingAccess } });
  };
}

/** Flag (or allowlist) on. `coaching.*` and `trainer.status` / `trainer.activate` use this. */
export const coachingProcedure = protectedProcedure.use(requireCoachingEnabled);

/** Flag on and the caller turned trainer tools on. Every other trainer.* procedure. */
export const trainerProcedure = coachingProcedure.use(requireActiveTrainer);
