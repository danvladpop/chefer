import { z } from 'zod';
import { emailPreferencesService } from '../application/notifications/email-preferences.service.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, publicProcedure, router } from '../lib/trpc.js';

// ─── Weekly emails: preferences, confirmation, unsubscribe (audit P2-5) ──────
// Every tier. The two public procedures take a signed token from an email
// link (lib/email/tokens.ts) — that token IS the authorization, which is how
// an unsubscribe link works without a login.

const tokenSchema = z.string().min(10).max(2000);

export const notificationsRouter = router({
  /** Monday / Sunday email switches + whether the address is confirmed. */
  getEmailPreferences: protectedProcedure.query(({ ctx }) => {
    return emailPreferencesService.get(ctx.user.id);
  }),

  setEmailPreferences: protectedProcedure
    .input(z.object({ weekReady: z.boolean().optional(), weeklyRecap: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      return emailPreferencesService.set(ctx.user.id, input);
    }),

  /** Re-sends the confirmation link (Preferences: "Send confirmation link"). */
  resendConfirmation: protectedProcedure.mutation(({ ctx }) => {
    assertWithinRateLimit('email.confirm.send', ctx.user.id, 3, 60 * 60 * 1000);
    return emailPreferencesService.sendConfirmation(ctx.user.id, ctx.user.firstName ?? null);
  }),

  /** Public: the /verify-email page consumes the emailed link. */
  confirmEmail: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit('email.confirm.consume', ctx.ipAddress, 20, 15 * 60 * 1000);
      return emailPreferencesService.confirm(input.token);
    }),

  /** Public: the /unsubscribe page (one click from the email, no login). */
  unsubscribe: publicProcedure
    .input(z.object({ token: tokenSchema, resubscribe: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit('email.unsubscribe', ctx.ipAddress, 20, 15 * 60 * 1000);
      return emailPreferencesService.unsubscribe(input.token, input.resubscribe ?? false);
    }),
});
