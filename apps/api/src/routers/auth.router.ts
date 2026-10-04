import { z } from 'zod';
import {
  authEmailSchema,
  linkIdentityInputSchema,
  regionCodeSchema,
  socialSignInInputSchema,
  unlinkIdentityInputSchema,
} from '@chefer/types';
import { authService } from '../application/auth/auth.service.js';
import { passwordResetService } from '../application/auth/password-reset.service.js';
import { socialAuthService } from '../application/auth/social-auth.service.js';
import { emailPreferencesService } from '../application/notifications/email-preferences.service.js';
import { env } from '../lib/env.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, publicProcedure, router } from '../lib/trpc.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: authEmailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long'),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  /**
   * Device region (ISO-3166 alpha-2) for location defaults — units and
   * currency (backlog P2-6). Optional: older apps don't send it.
   */
  region: regionCodeSchema.optional(),
  /**
   * Explicit sign-up consent (T-39.1, T-26.5). All optional here — a client
   * below `clientApiLevel` 2 (a wave-0 client already out on OTA, which
   * sends level 1, or an older installed binary at level 0) sends none of
   * these and still registers; `AuthService.register` is what requires them
   * once the caller declares level ≥ 2 (never a `z.literal(true)` at the
   * schema level, or an old client's omission would fail validation instead
   * of being ignored).
   */
  acceptedTerms: z.boolean().optional(),
  ageConfirmed: z.boolean().optional(),
  acceptedTermsVersion: z.string().min(1).max(40).optional(),
});

const loginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Per IP: bcrypt-backed credential checks must not be brute-forceable, and
// register must not be a free account-farming endpoint.

const AUTH_ATTEMPTS_MAX = env.AUTH_RATE_LIMIT_MAX;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    assertWithinRateLimit('auth.register', ctx.ipAddress, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
    const user = await authService.register(input, ctx.res, {
      includeSession: ctx.isMobileClient,
      clientApiLevel: ctx.clientApiLevel,
      consentSource: ctx.isMobileClient ? 'mobile' : 'web',
    });
    // Weekly emails need a confirmed address (audit P2-5) — best effort, the
    // signup never waits on or fails because of it.
    emailPreferencesService.sendConfirmationInBackground(user.id, user.firstName);
    return user;
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    assertWithinRateLimit('auth.login', ctx.ipAddress, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
    return authService.login(input, ctx.res, { includeSession: ctx.isMobileClient });
  }),

  /**
   * Sends a password-reset email. Always reports success so responses can't
   * be used to probe which addresses have accounts. Limited per IP and,
   * more tightly, per target address (mailbox-bombing protection).
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: authEmailSchema }))
    .mutation(async ({ input, ctx }) => {
      assertWithinRateLimit('pwreset.ip', ctx.ipAddress, 5, 15 * 60 * 1000);
      assertWithinRateLimit('pwreset.email', input.email.toLowerCase(), 3, 60 * 60 * 1000);
      await passwordResetService.requestReset(input.email);
      return { success: true as const };
    }),

  /**
   * Consumes a reset token: sets the new password and invalidates every
   * existing session for that account.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, 'Token is required'),
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .max(100, 'Password too long'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertWithinRateLimit('pwreset.consume', ctx.ipAddress, 10, 15 * 60 * 1000);
      await passwordResetService.resetPassword(input.token, input.password);
      return { success: true as const };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await authService.logout(ctx.sessionToken, ctx.res);
    return { success: true as const };
  }),

  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),

  // ─── Sign in with Google / Apple (WP-22) ────────────────────────────────────

  /**
   * Which providers this server is configured for, and the client ids the
   * SDKs need. Public + cheap: clients hide the buttons when `enabled` is false.
   */
  socialAvailability: publicProcedure.query(() => socialAuthService.availability()),

  /**
   * Sign in (or sign up) with a Google/Apple ID token. Returns exactly what
   * `login` returns for the client (session cookie for web; `session` in the
   * body for mobile) plus `isNewUser` / `linkedExistingAccount`. A NEW account
   * needs `acceptLegal: true`. Rate-limited like login.
   */
  socialSignIn: publicProcedure.input(socialSignInInputSchema).mutation(async ({ input, ctx }) => {
    assertWithinRateLimit('auth.social', ctx.ipAddress, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
    return socialAuthService.signIn(input, ctx.res, {
      includeSession: ctx.isMobileClient,
      consentSource: ctx.isMobileClient ? 'mobile' : 'web',
    });
  }),

  /** The caller's connected sign-in methods and whether they have a password. */
  linkedIdentities: protectedProcedure.query(({ ctx }) =>
    socialAuthService.listIdentities(ctx.user.id),
  ),

  /** Connects another Google/Apple account to the signed-in user. */
  linkIdentity: protectedProcedure.input(linkIdentityInputSchema).mutation(({ input, ctx }) => {
    assertWithinRateLimit('auth.social.link', ctx.user.id, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
    return socialAuthService.link(ctx.user.id, input);
  }),

  /** Disconnects a provider. Refused when it is the only way to sign in. */
  unlinkIdentity: protectedProcedure
    .input(unlinkIdentityInputSchema)
    .mutation(({ input, ctx }) => socialAuthService.unlink(ctx.user.id, input)),
});
