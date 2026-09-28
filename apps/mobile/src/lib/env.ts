import { z } from 'zod';

// EXPO_PUBLIC_* vars are inlined by the Expo bundler only when referenced as
// static `process.env.EXPO_PUBLIC_X` expressions — keep them spelled out.
const envSchema = z.object({
  /**
   * Base URL of the Chefer API. Optional in dev — the simulator/emulator
   * defaults in api-url.ts apply. A physical device MUST set this to the
   * host machine's LAN address (e.g. http://192.168.1.20:3001).
   */
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  /** Sentry DSN — error reporting is disabled when unset. */
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  /**
   * PostHog project key for the JS analytics transport (T-12.2, §5.10). No
   * key = no-op: nothing is queued or sent, and no `fetch` ever fires (AC3).
   */
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  /**
   * PostHog capture host. Rev 2 D24: EU only — must be `eu.i.posthog.com`
   * (matching web's `apps/web/src/lib/analytics.ts`), so startup fails loudly
   * rather than silently routing device data through a non-EU host.
   */
  EXPO_PUBLIC_POSTHOG_HOST: z
    .string()
    .url()
    .refine((v) => new URL(v).host === 'eu.i.posthog.com', {
      message: 'EXPO_PUBLIC_POSTHOG_HOST must be https://eu.i.posthog.com (rev 2 D24, EU only)',
    })
    .optional(),
});

export const env = envSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
});
