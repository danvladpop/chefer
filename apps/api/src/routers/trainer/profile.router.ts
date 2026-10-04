import {
  clientIdInputSchema,
  clientsListInputSchema,
  COACHING_LIMITS,
  createInviteInputSchema,
  revokeInviteInputSchema,
  trainerProfileInputSchema,
} from '@chefer/types';
import { coachingInviteService } from '../../application/coaching/coaching-invite.service.js';
import { coachingLinkService } from '../../application/coaching/coaching-link.service.js';
import { trainerProfileService } from '../../application/coaching/trainer-profile.service.js';
import {
  coachingProcedure,
  requireCoachingAccess,
  trainerProcedure,
} from '../../lib/coaching-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { router } from '../../lib/trpc.js';

// ─── trainer.* — profile, invites, client list (spec §7.2) ────────────────────
// Thin: handlers rate-limit and delegate to application/coaching/*.

/** `ctx.isMobileClient` (the `x-chefer-client` header) picks the source — never trust a client-supplied one. */
const sourceOf = (ctx: { isMobileClient: boolean }) => (ctx.isMobileClient ? 'mobile' : 'web');
const DAY_MS = 24 * 60 * 60 * 1000;

export const trainerInvitesRouter = router({
  list: trainerProcedure.query(({ ctx }) => coachingInviteService.list(ctx.user.id)),
  create: trainerProcedure.input(createInviteInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit(
      'trainer.invites.create',
      ctx.user.id,
      COACHING_LIMITS.invitesPerDay,
      DAY_MS,
    );
    return coachingInviteService.create(ctx.user.id, input.label);
  }),
  revoke: trainerProcedure
    .input(revokeInviteInputSchema)
    .mutation(({ ctx, input }) => coachingInviteService.revoke(ctx.user.id, input.code)),
});

export const trainerClientsRouter = router({
  list: trainerProcedure
    .input(clientsListInputSchema)
    .query(({ ctx, input }) => coachingLinkService.listClients(ctx.user.id, input?.today)),
  // Same uniform NOT_FOUND as every trainer.client.* denial: removing someone who is not your client.
  remove: trainerProcedure
    .use(requireCoachingAccess('write'))
    .input(clientIdInputSchema)
    .mutation(({ ctx, input }) =>
      coachingLinkService.removeClient(ctx.user.id, input.clientId, sourceOf(ctx)),
    ),
});

export const trainerProfileRouter = router({
  /** A non-trainer can ask (coachingProcedure): `canActivate` says whether the button shows. */
  status: coachingProcedure.query(({ ctx }) => trainerProfileService.status(ctx.user)),
  activate: coachingProcedure
    .input(trainerProfileInputSchema)
    .mutation(({ ctx, input }) => trainerProfileService.activate(ctx.user, input, sourceOf(ctx))),
  updateProfile: trainerProcedure
    .input(trainerProfileInputSchema)
    .mutation(({ ctx, input }) => trainerProfileService.updateProfile(ctx.user, input)),
  deactivate: trainerProcedure.mutation(({ ctx }) =>
    trainerProfileService.deactivate(ctx.user.id, sourceOf(ctx)),
  ),
  invites: trainerInvitesRouter,
  clients: trainerClientsRouter,
});
