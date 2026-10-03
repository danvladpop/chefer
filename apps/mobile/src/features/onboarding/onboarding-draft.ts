import { z } from 'zod';
import { DISPLAY_CURRENCIES, onboardingJobSchema, planShapeSchema } from '@chefer/types';
import { kv } from '../gym/offline/kv';

// UX-ONB-01: the onboarding wizard's answers, kept in the on-device KV store
// after every change so an Android BACK-out or a killed process resumes where
// the user was instead of dropping them on an empty Today. Its mere existence
// is also the "setup unfinished" flag. One key, scoped to the SESSION the
// answers were typed in (a fingerprint of the token — synchronous, no
// network, and a different account's token never matches). Removed on finish
// and by `signOut()` (every KV key but the device ones).
//
// Draft values are untrusted on read (a version bump, a half-written
// payload): each field falls back to its empty value instead of failing the
// whole draft.

export const ONBOARDING_DRAFT_KEY = 'onboarding.draft';

const weekdaySchema = z.number().int().min(0).max(6);

export const onboardingDraftSchema = z.object({
  v: z.literal(1),
  scope: z.string(),
  step: z.number().int().min(0).catch(0),
  jobs: z.array(onboardingJobSchema).catch([]),
  trainingWeekdays: z.array(weekdaySchema).catch([]),
  trainingDayKinds: z.record(z.string(), z.enum(['run', 'long_run'])).catch({}),
  howYouCook: z
    .object({
      shape: planShapeSchema.extend({ leftovers: z.boolean() }).nullable().catch(null),
      currency: z.enum(DISPLAY_CURRENCIES).catch('EUR'),
      units: z.enum(['METRIC', 'IMPERIAL']).catch('METRIC'),
      autoPlanWeekly: z.boolean().catch(false),
    })
    .nullable()
    .catch(null),
  goodFood: z.boolean().catch(false),
  goal: z.string().nullable().catch(null),
  metrics: z
    .object({
      biologicalSex: z.enum(['MALE', 'FEMALE']).nullable().catch(null),
      age: z.number().nullable().catch(null),
      heightCm: z.number().nullable().catch(null),
      weightKg: z.number().nullable().catch(null),
      activityLevel: z
        .enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'ATHLETE'])
        .nullable()
        .catch(null),
    })
    .nullable()
    .catch(null),
  ageText: z.string().catch(''),
  heightText: z.string().catch(''),
  // UX-ONB-05: the inches beside imperial feet. Absent in drafts written by 1.0.1.
  inchesText: z.string().optional().catch(undefined),
  weightText: z.string().catch(''),
  safety: z
    .object({
      dietaryRestrictions: z.array(z.string()).catch([]),
      allergies: z.array(z.string()).catch([]),
      dislikedIngredients: z.array(z.string()).catch([]),
    })
    .nullable()
    .catch(null),
  cuisine: z
    .object({
      cuisinePreferences: z.array(z.string()).catch([]),
      mealsPerDay: z.number().int().catch(3),
    })
    .nullable()
    .catch(null),
});

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
/** What the wizard hands over to be saved (the scope is added here). */
export type OnboardingDraftAnswers = Omit<OnboardingDraft, 'v' | 'scope'>;

/** Non-reversible 32-bit FNV-1a fingerprint — tells sessions apart, reveals nothing. */
export function onboardingDraftScope(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * The draft for the signed-in session, or null. A draft typed under another
 * session (it should not survive sign-out, but never trust that) is removed
 * rather than shown.
 */
export function readOnboardingDraft(token: string | null): OnboardingDraft | null {
  if (token === null) return null;
  const raw = kv.getJSON(ONBOARDING_DRAFT_KEY);
  if (raw === null) return null;
  const parsed = onboardingDraftSchema.safeParse(raw);
  if (!parsed.success || parsed.data.scope !== onboardingDraftScope(token)) {
    kv.remove(ONBOARDING_DRAFT_KEY);
    return null;
  }
  return parsed.data;
}

export function writeOnboardingDraft(token: string | null, answers: OnboardingDraftAnswers): void {
  if (token === null) return;
  const draft: OnboardingDraft = { v: 1, scope: onboardingDraftScope(token), ...answers };
  kv.setJSON(ONBOARDING_DRAFT_KEY, draft);
}

export function clearOnboardingDraft(): void {
  kv.remove(ONBOARDING_DRAFT_KEY);
}
