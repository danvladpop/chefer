import { z } from 'zod';

/**
 * `https://eu.i.posthog.com`, with or without a trailing slash. Never throws:
 * zod runs a refinement even after `.url()` has failed, and a throw there
 * escapes `.catch()`, so the parse itself happens inside the try.
 */
function isEuPostHogHost(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === 'eu.i.posthog.com';
  } catch {
    return false;
  }
}

// EXPO_PUBLIC_* vars are inlined by the Expo bundler only when referenced as
// static `process.env.EXPO_PUBLIC_X` expressions — keep them spelled out.
const envSchema = z.object({
  /**
   * Base URL of the Chefer API. Optional in dev — the simulator/emulator
   * defaults in api-url.ts apply. A physical device MUST set this to the
   * host machine's LAN address (e.g. http://192.168.1.20:3001).
   */
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  /**
   * Sentry DSN (M1-6, src/lib/crash-reporting.ts) — crash reporting is off
   * when unset. Empty or malformed also means off, never a startup throw: a
   * typo in a CI variable must not take down every installed app over the
   * air just to disable crash reporting.
   */
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional().catch(undefined),
  /**
   * PostHog project key for the JS analytics transport (T-12.2, §5.10). No
   * key = no-op: nothing is queued or sent, and no `fetch` ever fires (AC3).
   */
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  /**
   * PostHog capture host. Rev 2 D24: EU only — must be `https://eu.i.posthog.com`
   * (matching web's `apps/web/src/lib/analytics.ts`). Anything else (another
   * host, plain http, empty, malformed) means analytics is OFF, never a
   * startup throw: device data never goes to a non-EU host, and, as with the
   * Sentry DSN, a typo in a CI variable can't take down every installed app
   * over the air. The deploy workflow rejects such a value before bundling.
   */
  EXPO_PUBLIC_POSTHOG_HOST: z.string().refine(isEuPostHogHost).optional().catch(undefined),
});

export const env = envSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
});
