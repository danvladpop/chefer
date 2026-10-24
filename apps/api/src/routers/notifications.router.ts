import { z } from 'zod';
import {
  registerPushDeviceInputSchema,
  setPushPreferenceInputSchema,
  unregisterPushDeviceInputSchema,
} from '@chefer/types';
import { emailPreferencesService } from '../application/notifications/email-preferences.service.js';
import { pushService } from '../application/notifications/push.service.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, publicProcedure, router } from '../lib/trpc.js';

// ─── Weekly emails: preferences, confirmation, unsubscribe (audit P2-5) ──────
// Every tier. The two public procedures take a signed token from an email
// link (lib/email/tokens.ts) — that token IS the authorization, which is how
// an unsubscribe link works without a login.

const tokenSchema = z.string().min(10).max(2000);

const HOUR_MS = 60 * 60 * 1000;

// ─── Push (trainer-mode.md §7.2, §9; M4) ─────────────────────────────────────
// register on sign-in / app start once permission is granted, unregister on
// sign out; the §7.2 switches (a missing row = on). A device token is never
// logged or returned.
const pushRouter = router({
  /** Upserts the device (a token signed in elsewhere moves to the caller) and its lastSeenAt. */
  register: protectedProcedure.input(registerPushDeviceInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('push.register', ctx.user.id, 30, HOUR_MS);
    return pushService.register(ctx.user.id, input);
  }),

  /** Deletes this token if it is the caller's (sign out). Idempotent. */
  unregister: protectedProcedure
    .input(unregisterPushDeviceInputSchema)
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit('push.unregister', ctx.user.id, 30, HOUR_MS);
      return pushService.unregister(ctx.user.id, input.token);
    }),

  /** Every §7.2 key with its value (defaults applied), audience, and whether a device is registered. */
  preferences: protectedProcedure.query(({ ctx }) => pushService.preferences(ctx.user.id)),

  /** Sets one switch; returns the whole list. */
  setPreference: protectedProcedure
    .input(setPushPreferenceInputSchema)
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit('push.setPreference', ctx.user.id, 120, HOUR_MS);
      return pushService.setPreference(ctx.user.id, input.key, input.enabled);
    }),
});

export const notificationsRouter = router({
  push: pushRouter,

  /** Monday / Sunday email switches + whether the address is confirmed. */
  getEmailPreferences: protectedProcedure.query(({ ctx }) => {
    return emailPreferencesService.get(ctx.user.id);
  }),

  setEmailPreferences: protectedProcedure
    .input(z.object({ weekReady: z.boolean().optional(), weeklyRecap: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      return emailPreferencesService.set(ctx.user.id, input, ctx.isMobileClient ? 'mobile' : 'web');
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
