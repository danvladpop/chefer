// ─── Trainer coaching: the client's food and weight sharing (lane K1) ─────────
// Owner decision 2026-10-22 (docs/market-review-2026-10/IMPLEMENTATION-PLAN.md):
// a client opts in PER COACHING to share their food log and / or body weight
// with their trainer. Both are off by default, offered on the consent screen
// and later in Your trainer, revocable at any time (the trainer loses access on
// their next request), and every change is a COACHING_SHARING consent event on
// the client's log with `providers` ['FOOD'] or ['WEIGHT'].
//
// What sharing never includes: allergies, diet settings, notes, photos, body
// measurements. The food log shows what the client logged, against their
// targets, in the numbers the client chose to see (`TrainerNumbersView`).

import { z } from 'zod';
import { localDateSchema } from '../gym/schemas';
import { COACHING_CONSENT_LABELS } from './copy';
import { coachingClientIdSchema, coachingSourceSchema, type CoachingShareChoice } from './schemas';

/** The two things a client can share. Upper case: the consent event's `providers` value. */
export const COACHING_SHARED_DATA = ['FOOD', 'WEIGHT'] as const;
export type CoachingSharedData = (typeof COACHING_SHARED_DATA)[number];

/**
 * The version of the sharing consent copy (`COACHING_SHARING_COPY.food/weight`).
 * A sharing event's `documentVersion` is `<privacy version>+coaching-data-v<N>`.
 */
export const COACHING_DATA_CONSENT_VERSION = 1;

export const COACHING_DATA_LIMITS = {
  /** The trainer sees the food log of this many days back (today included), like workouts (Q-2). */
  foodHistoryDays: 28,
  /** `trainer.client.food` returns this many days unless asked for more. */
  foodDefaultDays: 7,
  /** The trainer sees weigh-ins from this many days back. */
  weightHistoryDays: 90,
  /** Logged entries listed per day (the rest are counted, not named). */
  entriesPerDay: 12,
} as const;

/** Both switches off: what the consent screen starts with. */
export const NO_COACHING_SHARE: CoachingShareChoice = { food: false, weight: false };

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** `coaching.setSharing`: change one switch or both. A switch left out stays as it is. */
export const setCoachingSharingInputSchema = z
  .object({
    food: z.boolean().optional(),
    weight: z.boolean().optional(),
    source: coachingSourceSchema.optional(),
  })
  .refine((v) => v.food !== undefined || v.weight !== undefined, {
    message: 'Nothing to change.',
  });
export type SetCoachingSharingInput = z.infer<typeof setCoachingSharingInputSchema>;

/** `trainer.client.food`: the last `days` days ending `today` (the trainer's device-local date). */
export const clientFoodInputSchema = z.object({
  clientId: coachingClientIdSchema,
  today: localDateSchema,
  days: z
    .number()
    .int()
    .min(1)
    .max(COACHING_DATA_LIMITS.foodHistoryDays)
    .default(COACHING_DATA_LIMITS.foodDefaultDays),
});
export type ClientFoodInput = z.infer<typeof clientFoodInputSchema>;

/** `trainer.client.weight`: weigh-ins of the last COACHING_DATA_LIMITS.weightHistoryDays days. */
export const clientWeightInputSchema = z.object({
  clientId: coachingClientIdSchema,
  today: localDateSchema,
});
export type ClientWeightInput = z.infer<typeof clientWeightInputSchema>;

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** The client's own view of their switches (`coaching.status.trainer.sharing`). */
export interface CoachingSharingDto {
  food: boolean;
  weight: boolean;
  /** ISO date-time the switch was turned on, or null when off. */
  foodSince: string | null;
  weightSince: string | null;
}

/** What the trainer is told about a client's switches (client rows, overview). */
export interface ClientSharingDto {
  food: boolean;
  weight: boolean;
}

/**
 * Which numbers the trainer sees, following the client's own numbers mode
 * (WP-08 / lane E3's "hide numbers"): FULL = calories and protein,
 * PROTEIN_ONLY = protein only, NONE = no numbers at all (meals and plan only).
 */
export type TrainerNumbersView = 'FULL' | 'PROTEIN_ONLY' | 'NONE';

export interface ClientFoodEntryDto {
  /** The recipe or custom entry's name ("Chicken traybake", "Shawarma"). */
  name: string;
  /** breakfast | lunch | dinner | snack (as logged). */
  mealType: string;
  /** Null when the client's numbers mode hides it. */
  kcal: number | null;
  proteinG: number | null;
  /** Logged from the meal plan (a planned recipe ticked), not something else. */
  onPlan: boolean;
}

export interface ClientFoodDayDto {
  /** Device-local `YYYY-MM-DD`. */
  date: string;
  /** Entries logged that day. */
  mealsLogged: number;
  /** Null when hidden by the numbers view (calories: FULL only; protein: not NONE). */
  kcal: number | null;
  proteinG: number | null;
  targetKcal: number | null;
  targetProteinG: number | null;
  /**
   * Plan adherence for the day, null when nothing was planned. `eaten` = planned
   * meals logged as planned, `swapped` = "ate something else", `skipped` = "skipped it".
   */
  plan: { planned: number; eaten: number; swapped: number; skipped: number } | null;
  /** At most COACHING_DATA_LIMITS.entriesPerDay, in logged order. */
  entries: ClientFoodEntryDto[];
}

/** `trainer.client.food` (scope `food`: an ACTIVE coaching AND the client shares their food log). */
export interface ClientFoodDto {
  numbers: TrainerNumbersView;
  /** ISO date-time the client turned sharing on. */
  sharedSince: string;
  /** Oldest first; the last one is `today`. */
  days: ClientFoodDayDto[];
}

export interface ClientWeightEntryDto {
  /** Device-local `YYYY-MM-DD` of the weigh-in (UTC date of `recordedAt`). */
  date: string;
  weightKg: number;
}

/** `trainer.client.weight` (scope `weight`: an ACTIVE coaching AND the client shares their weight). */
export interface ClientWeightDto {
  /** ISO date-time the client turned sharing on. */
  sharedSince: string;
  /** Oldest first, at most one per day (the day's last weigh-in). */
  entries: ClientWeightEntryDto[];
}

// ─── Copy (web and mobile render the same strings) ────────────────────────────
// The switch texts are part of the consent the client gives: change them only
// together with the privacy policy, and bump COACHING_DATA_CONSENT_VERSION.

export const COACHING_SHARING_COPY = {
  heading: 'You choose what else to share',
  settingsHeading: (trainer: string) => `What you share with ${trainer}`,
  food: {
    label: 'Share my food log',
    body: (trainer: string) =>
      `${trainer} sees what you log each day: meals, calories and protein against your targets, and how closely you follow your meal plan. From the last 4 weeks and from now on, while this is on.`,
    on: (trainer: string) => `${trainer} can now see your food log`,
    off: (trainer: string) => `${trainer} can no longer see your food log`,
  },
  weight: {
    label: 'Share my weight',
    body: (trainer: string) =>
      `${trainer} sees your weigh-ins from the last 3 months and from now on, while this is on.`,
    on: (trainer: string) => `${trainer} can now see your weight`,
    off: (trainer: string) => `${trainer} can no longer see your weight`,
  },
  footer:
    'Both are off unless you turn them on. Change them any time in Your trainer. Your allergies and diet settings are never shared.',
  numbersNote:
    'If you hide calories or all numbers in Chefer, your trainer sees the same: no numbers you’ve hidden.',
  saveError: 'Couldn’t save that. Try again.',
  /** Consent history rows (COACHING_SHARING with providers FOOD / WEIGHT). */
  history: {
    FOOD: { granted: 'Food log shared with your trainer', withdrawn: 'Food log no longer shared' },
    WEIGHT: { granted: 'Weight shared with your trainer', withdrawn: 'Weight no longer shared' },
  },
} as const;

/**
 * A consent-history row's label. `providers` [] is the coaching itself;
 * ['FOOD'] / ['WEIGHT'] is a sharing switch (lane K1). Null = not a coaching row.
 */
export function coachingConsentLabel(event: {
  kind: string;
  granted: boolean;
  providers: readonly string[];
}): string | null {
  if (event.kind !== 'COACHING_SHARING') return null;
  const data = event.providers[0];
  if (data === 'FOOD' || data === 'WEIGHT') {
    return COACHING_SHARING_COPY.history[data][event.granted ? 'granted' : 'withdrawn'];
  }
  return COACHING_CONSENT_LABELS[event.granted ? 'granted' : 'withdrawn'];
}

// ─── Lane K2: the trainer's views (client detail) ─────────────────────────────

/** `trainer.client.weekSummary`: the 7 days ending `today` (the trainer's device-local date). */
export const clientWeekSummaryInputSchema = z.object({
  clientId: coachingClientIdSchema,
  today: localDateSchema,
});
export type ClientWeekSummaryInput = z.infer<typeof clientWeekSummaryInputSchema>;

/** The food part of the weekly card: only when the client shares their food log. */
export interface ClientWeekFoodDto {
  numbers: TrainerNumbersView;
  /** Days with at least one logged entry, of 7. */
  daysLogged: number;
  mealsLogged: number;
  /** Averages over the logged days; null when hidden by the numbers view or nothing was logged. */
  avgKcal: number | null;
  avgProteinG: number | null;
  /** The average daily target over the 7 days, in the same view. */
  targetKcal: number | null;
  targetProteinG: number | null;
  /** Planned meals eaten as planned ÷ planned meals, 0–1; null with nothing planned. */
  planAdherence: number | null;
}

/** The weight part of the weekly card: only when the client shares their weight. */
export interface ClientWeekWeightDto {
  /** The latest weigh-in in the last 90 days, or null. */
  latest: ClientWeightEntryDto | null;
  /** The latest weigh-in minus the last one on or before 7 days ago (kg, one decimal); null without both. */
  changeKg: number | null;
}

/** `trainer.client.weekSummary` (scope `read`): training always, food / weight only when shared. */
export interface ClientWeekSummaryDto {
  /** `YYYY-MM-DD`, 7 days: `from` … `to` (= today). */
  from: string;
  to: string;
  /** Completed workouts in the 7 days against the weekly goal. */
  workouts: { done: number; goal: number };
  sharing: ClientSharingDto;
  /** Null unless the client shares their food log. */
  food: ClientWeekFoodDto | null;
  /** Null unless the client shares their weight. */
  weight: ClientWeekWeightDto | null;
}

/** Trainer-side copy (web and mobile). Numbers are formatted by the app and passed in. */
export const COACHING_DATA_COPY = {
  week: {
    title: 'Last 7 days',
    workouts: (done: number, goal: number) =>
      goal > 0 ? `${done} of ${goal} workouts` : `${done} ${done === 1 ? 'workout' : 'workouts'}`,
    daysLogged: (days: number) => `Food logged ${days} of 7 days`,
    avgKcal: (avg: string, target: string | null) =>
      target ? `${avg} of ${target} kcal a day` : `${avg} kcal a day`,
    avgProtein: (avg: string, target: string | null) =>
      target ? `${avg} of ${target} g protein a day` : `${avg} g protein a day`,
    plan: (pct: number) => `${pct}% of planned meals eaten as planned`,
    noPlan: 'No meal plan this week',
    weightLatest: (weight: string, date: string) => `${weight} · ${date}`,
    weightChange: (change: string) => `${change} in 7 days`,
    weightSteady: 'Steady over 7 days',
    noWeighIn: 'No weigh-in yet',
    notShared: (client: string) => `${client} doesn’t share food or weight with you.`,
    notSharedHint: 'Clients choose this in Your trainer. Ask them if it would help.',
    numbersHidden: (client: string) => `${client} hides numbers in Chefer, so you see meals only.`,
    caloriesHidden: (client: string) => `${client} hides calories in Chefer.`,
  },
  tab: 'Food',
  food: {
    heading: 'Food log',
    sharedSince: (date: string) => `Shared since ${date}`,
    nothingLogged: 'Nothing logged',
    meals: (n: number) => `${n} ${n === 1 ? 'meal' : 'meals'}`,
    kcal: (kcal: number, target: number | null) =>
      target !== null
        ? `${kcal.toLocaleString('en-GB')} / ${target.toLocaleString('en-GB')} kcal`
        : `${kcal.toLocaleString('en-GB')} kcal`,
    protein: (g: number, target: number | null) =>
      target !== null ? `${g} / ${target} g protein` : `${g} g protein`,
    plan: (eaten: number, planned: number) => `${eaten} of ${planned} planned`,
    onPlan: 'From the plan',
    notShared: (client: string) => `${client} doesn’t share their food log.`,
  },
  weight: {
    heading: 'Weight',
    notShared: (client: string) => `${client} doesn’t share their weight.`,
    empty: 'No weigh-ins in the last 3 months.',
    // TODO(lane D1): "Trend" once the trend weight is on master.
  },
} as const;
