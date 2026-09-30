import { TRPCError } from '@trpc/server';
import { userRepository } from '@chefer/database';
import { HEALTH_CONSENT_API_LEVEL, HEALTH_CONSENT_REQUIRED } from '@chefer/types';

// ─── Health-consent server gate (§2.8, T-26.3) ────────────────────────────────
// `requireHealthConsent` (lib/trpc.ts) runs this before a health-write
// procedure. Rules, by `HEALTH_CONSENT_ENFORCE`:
//
//   off       nothing is rejected (every env file stays here until wave 4)
//   declared  an un-consented write is rejected ONLY when the client declares
//             `x-chefer-api-level >= HEALTH_CONSENT_API_LEVEL` (it understands
//             the error and shows the sheet). A request WITHOUT the header —
//             an installed binary — is always accepted.
//   all       every client is rejected (only once every install has the OTA)
//
// A user who HAS consented is never rejected in any mode.

export type HealthConsentEnforce = 'off' | 'declared' | 'all';

/** Marks the rejection so the errorFormatter can expose `data.healthConsentRequired`. */
export class HealthConsentRequiredCause extends Error {
  constructor() {
    super(HEALTH_CONSENT_REQUIRED);
  }
}

/**
 * Whether this client is subject to enforcement at all. Pure — the whole
 * rollout policy in one place, unit-tested for every mode x level.
 */
export function healthConsentEnforced(mode: HealthConsentEnforce, clientApiLevel: number): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return clientApiLevel >= HEALTH_CONSENT_API_LEVEL;
}

/**
 * `HEALTH_CONSENT_ENFORCE` from the validated env, imported lazily: lib/env.ts
 * validates (and throws on) the process environment at import time, and this
 * module sits in lib/trpc.ts's import graph — a static import would make every
 * router test that never touches env require the full set of secrets. In the
 * running server env.ts has long since loaded (index.ts imports it first), so
 * this resolves from the module cache; where env can't load (a bare unit
 * test) enforcement is `off`, which is also the shipped default.
 */
async function configuredMode(): Promise<HealthConsentEnforce> {
  try {
    const { env } = await import('./env.js');
    return env.HEALTH_CONSENT_ENFORCE;
  } catch {
    return 'off';
  }
}

/**
 * Throws `PRECONDITION_FAILED` (`cause: HEALTH_CONSENT_REQUIRED`) when the
 * mode/level say this write needs consent and the user has none. Reads the
 * consent cache column only when enforcement applies — `off` costs nothing.
 */
export async function assertHealthConsent(params: {
  userId: string;
  clientApiLevel: number;
  /** Test seam; defaults to the validated env. */
  mode?: HealthConsentEnforce;
}): Promise<void> {
  const mode = params.mode ?? (await configuredMode());
  if (!healthConsentEnforced(mode, params.clientApiLevel)) return;
  const consentedAt = await userRepository.findHealthConsentAt(params.userId);
  if (consentedAt) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: HEALTH_CONSENT_REQUIRED,
    cause: new HealthConsentRequiredCause(),
  });
}

// ─── "Does this input carry health data?" predicates ──────────────────────────
// Clearing a list (an empty array) or saving only non-health fields never needs
// consent: "Don't save it" keeps the step's other answers (UX-26 AC2).

const hasItems = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/** `preferences.updateSafety`, household add/update: any allergy/diet/dislike being written. */
export function writesSafetyTerms(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return (
    hasItems(i['allergies']) ||
    hasItems(i['dietaryRestrictions']) ||
    hasItems(i['dislikedIngredients'])
  );
}

const BODY_FIELDS = [
  'goal',
  'biologicalSex',
  'age',
  'heightCm',
  'weightKg',
  'activityLevel',
] as const;

/** `preferences.saveProfileBasics` / `updateTargets`: any goal or body-metric field being written. */
export function writesBodyMetrics(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return BODY_FIELDS.some((k) => i[k] !== undefined && i[k] !== null);
}
