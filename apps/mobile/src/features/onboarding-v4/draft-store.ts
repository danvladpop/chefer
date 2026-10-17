import { z } from 'zod';
import { onboardingJobSchema } from '@chefer/types';
import { ONBOARDING_V4_STEP_ORDER, type OnboardingV4Step } from '@chefer/utils';
import { kv } from '../gym/offline/kv';
import { onboardingDraftScope } from '../onboarding/onboarding-draft';

// UX-ONB-01 for Onboarding V4: the answers so far, kept in the on-device KV
// store after every change so a killed app or "Leave for now" resumes on the
// same step. V4 saves jobs on its first step, so without this the gate (which
// otherwise falls back to "no jobs yet") would never bring the user back.
// Scoped to the session like the V3 draft; removed on finish and by
// `signOut()`. Untrusted on read: each field falls back to its empty value.

const KEY = 'onboardingV4.draft';

const weekdaySchema = z.number().int().min(0).max(6);
const stepSchema = z.enum(ONBOARDING_V4_STEP_ORDER as [OnboardingV4Step, ...OnboardingV4Step[]]);

const onboardingV4DraftSchema = z.object({
  v: z.literal(1),
  scope: z.string(),
  step: stepSchema.catch('jobs'),
  jobs: z.array(onboardingJobSchema).catch([]),
  startedPremium: z.boolean().catch(false),
  goalChoice: z.number().int().min(0).nullable().catch(null),
  about: z
    .object({
      sex: z.enum(['FEMALE', 'MALE']).nullable().catch(null),
      age: z.string().catch(''),
      height: z.string().catch(''),
      heightInches: z.string().catch(''),
      weight: z.string().catch(''),
      trainingWeekdays: z.array(weekdaySchema).catch([]),
    })
    .catch({ sex: null, age: '', height: '', heightInches: '', weight: '', trainingWeekdays: [] }),
  activityOverride: z
    .enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'ATHLETE'])
    .nullable()
    .catch(null),
  safety: z
    .object({
      dietaryRestrictions: z.array(z.string()).catch([]),
      allergies: z.array(z.string()).catch([]),
      dislikedIngredients: z.array(z.string()).catch([]),
    })
    .catch({ dietaryRestrictions: [], allergies: [], dislikedIngredients: [] }),
  healthDeclined: z.boolean().catch(false),
  planBuilt: z.boolean().catch(false),
  premiumOn: z.boolean().catch(false),
  experience: z.enum(['BEGINNER', 'INTERMEDIATE']).catch('BEGINNER'),
  equipment: z.enum(['FULL_GYM', 'DUMBBELLS', 'BODYWEIGHT']).catch('FULL_GYM'),
  /** Simple training mode §6.1: the "How do you like to train?" answer, once given. */
  styleAnswer: z.enum(['program', 'workout', 'classes']).optional().catch(undefined),
});

export type OnboardingV4Draft = z.infer<typeof onboardingV4DraftSchema>;
export type OnboardingV4DraftAnswers = Omit<OnboardingV4Draft, 'v' | 'scope'>;

/** The draft for the signed-in session, or null (another session's is removed). */
export function readOnboardingV4Draft(token: string | null): OnboardingV4Draft | null {
  if (token === null) return null;
  const raw = kv.getJSON(KEY);
  if (raw === null) return null;
  const parsed = onboardingV4DraftSchema.safeParse(raw);
  if (!parsed.success || parsed.data.scope !== onboardingDraftScope(token)) {
    kv.remove(KEY);
    return null;
  }
  return parsed.data;
}

export function writeOnboardingV4Draft(
  token: string | null,
  answers: OnboardingV4DraftAnswers,
): void {
  if (token === null) return;
  kv.setJSON(KEY, {
    v: 1,
    scope: onboardingDraftScope(token),
    ...answers,
  } satisfies OnboardingV4Draft);
}

export function clearOnboardingV4Draft(): void {
  kv.remove(KEY);
}
