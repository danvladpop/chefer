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
});

export const env = envSchema.parse({
  // Expo's process.env is typed `any` — the schema re-validates the values.
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL as string | undefined,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN as string | undefined,
});
