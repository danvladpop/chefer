import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createHouseholdInviteInputSchema,
  HOUSEHOLD_SHARING_COPY,
  HOUSEHOLD_SHARING_LIMITS,
  householdInviteCodeInputSchema,
  householdMemberFieldsSchema,
  joinHouseholdInputSchema,
  removeHouseholdPartnerInputSchema,
} from '@chefer/types';
import { householdAccess } from '../application/household/household-access.service.js';
import { householdService } from '../application/household/household.service.js';
import { writesSafetyTerms } from '../lib/health-consent.js';
import { householdScopedProcedure } from '../lib/household-middleware.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, requireHealthConsent, router } from '../lib/trpc.js';

// ─── Household router (F2, backlog P2-3; sharing ADR 0003) ────────────────────
// Thin wrapper per CLAUDE.md. Every procedure is open to every tier since
// P2-3: members' allergies and restrictions are safety, and safety is never
// premium. The count cap comes from `householdMembers` inside the service;
// portion SCALING (`householdPlans`) is enforced where lists and costs are
// built, not here.
//
// Sharing (ADR 0003): a partner sees the OWNER's members (the table they eat
// at) and may edit only the profile they claimed; adding and removing stay the
// owner's. Members carry `hasAccount` / `isYou` (additive), never an account id.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const householdRouter = router({
  /** All of the household's members (empty array when it's just them). */
  list: householdScopedProcedure.query(async ({ ctx }) => {
    const members = await householdService.list(ctx.household.planUserId);
    const partner = ctx.household.role === 'PARTNER';
    return members.map(({ claimedBy, ...m }) => ({
      ...m,
      // A partner never gets the owner's account id (ADR 0003 privacy line).
      userId: partner ? '' : m.userId,
      hasAccount: claimedBy !== null,
      isYou: claimedBy === ctx.user.id,
    }));
  }),

  /** Adds a member — capped by PLAN_FEATURES.householdMembers, race-free. */
  // T-26.3: a member's allergies/diets/dislikes are health data — a member with
  // only a name and portion needs no consent ("Don't save it" keeps those).
  add: householdScopedProcedure
    .input(householdMemberFieldsSchema)
    .use(requireHealthConsent(writesSafetyTerms))
    .mutation(async ({ input, ctx }) => {
      householdAccess.assertNotPartner(ctx.household);
      return householdService.add(ctx.user, input);
    }),

  update: householdScopedProcedure
    .input(householdMemberFieldsSchema.partial().extend({ id: z.string().cuid() }))
    .use(requireHealthConsent(writesSafetyTerms))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const scope = ctx.household;
      // A partner edits only the profile they claimed (their own portion and terms).
      if (scope.role === 'PARTNER' && scope.memberId !== id) {
        householdAccess.assertNotPartner(scope);
      }
      return householdService.update(scope.planUserId, id, data);
    }),

  remove: householdScopedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      householdAccess.assertNotPartner(ctx.household);
      await householdAccess.beforeMemberDeleted(ctx.user, input.id);
      return householdService.remove(ctx.user.id, input.id);
    }),

  // ─── Sharing (ADR 0003) ────────────────────────────────────────────────────

  /** The Household screen's sharing state: role, partners, open invites, the one entitlement. */
  sharing: protectedProcedure.query(({ ctx }) => householdAccess.status(ctx.user)),

  invites: router({
    create: protectedProcedure
      .input(createHouseholdInviteInputSchema)
      .mutation(({ ctx, input }) => {
        assertWithinRateLimit(
          'household.invites.create',
          ctx.user.id,
          HOUSEHOLD_SHARING_LIMITS.invitesPerDay,
          DAY_MS,
        );
        return householdAccess.createInvite(ctx.user, input.memberId);
      }),
    revoke: protectedProcedure
      .input(householdInviteCodeInputSchema)
      .mutation(({ ctx, input }) => householdAccess.revokeInvite(ctx.user.id, input.code)),
  }),

  previewInvite: protectedProcedure
    .input(householdInviteCodeInputSchema)
    .query(({ ctx, input }) => {
      assertWithinRateLimit(
        'household.previewInvite',
        ctx.user.id,
        HOUSEHOLD_SHARING_LIMITS.previewPerHour,
        HOUR_MS,
      );
      return householdAccess.preview(ctx.user.id, input.code);
    }),

  /** The join screen's consent: the partner's confirmed safety terms are health data (T-26.3). */
  join: protectedProcedure
    .input(joinHouseholdInputSchema)
    .use(requireHealthConsent(writesSafetyTerms))
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit(
        'household.join',
        ctx.user.id,
        HOUSEHOLD_SHARING_LIMITS.joinPerHour,
        HOUR_MS,
      );
      return householdAccess.join(ctx.user, input);
    }),

  leave: protectedProcedure.mutation(({ ctx }) => householdAccess.leave(ctx.user)),

  removePartner: householdScopedProcedure
    .input(removeHouseholdPartnerInputSchema)
    .mutation(({ ctx, input }) => {
      if (ctx.household.role === 'PARTNER') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: HOUSEHOLD_SHARING_COPY.ownerOnly(ctx.household.ownerName),
        });
      }
      return householdAccess.removePartner(ctx.user, input.linkId);
    }),

  notices: protectedProcedure.query(({ ctx }) => householdAccess.notices(ctx.user.id)),
  dismissNotice: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(({ ctx, input }) => householdAccess.dismissNotice(ctx.user.id, input.id)),
});
