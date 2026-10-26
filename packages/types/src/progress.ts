import { z } from 'zod';
import { clientIdSchema, localDateSchema } from './gym/schemas';
import { planSlotMealTypeSchema } from './meal-plan-slot';

// ─── Kitchen progress (docs/gamification-2026-10/tech-plan.md) ────────────────
// The contracts every layer shares: ledger kinds, receipt lines, settings and
// the DTOs of the `progress.*` procedures. Rules (XP values, levels, the
// Flame, achievements) live in @chefer/utils `progress/`. Guardrail 1: nothing
// here may describe eating less or weighing less — no kind, line, quest or
// achievement metric reads kcal, carbs, fat or body weight.

/** Ledger event kinds (`ProgressEvent.kind`). Stored as a string, so P2 kinds need no schema change. */
export const PROGRESS_EVENT_KINDS = [
  'WELCOME',
  'MEAL_LOGGED',
  'FULL_DAY',
  'PROTEIN_GOAL',
  'COOK_FINISHED',
  'WORKOUT_COMPLETED',
  'WORKOUT_PRS',
  'SHOP_DONE',
  'TODAYS_THREE',
  'WEEK_GOAL',
] as const;
export const progressEventKindSchema = z.enum(PROGRESS_EVENT_KINDS);
export type ProgressEventKind = z.infer<typeof progressEventKindSchema>;

/** Kinds that make a day an active day for the Flame. */
export const ACTIVE_DAY_KINDS: readonly ProgressEventKind[] = [
  'MEAL_LOGGED',
  'COOK_FINISHED',
  'WORKOUT_COMPLETED',
];

/** One line of a Kitchen receipt ("+25 Cooked at home"). Labels: `receiptLineLabel` in @chefer/utils. */
export const RECEIPT_LINE_CODES = [
  'WELCOME',
  'LOGGED',
  'ON_PLAN',
  'FULL_DAY',
  'PROTEIN_GOAL',
  'COOKED_AT_HOME',
  'FIRST_TIME',
  'WORKOUT_DONE',
  'PR_E1RM',
  'PR_WEIGHT',
  'PR_REPS',
  'SHOP_DONE',
  'TODAYS_THREE',
  'WEEK_GOAL',
] as const;
export const receiptLineCodeSchema = z.enum(RECEIPT_LINE_CODES);
export type ReceiptLineCode = z.infer<typeof receiptLineCodeSchema>;

export const receiptLineSchema = z.object({
  code: receiptLineCodeSchema,
  xp: z.number().int(),
  /** Optional detail for the label, e.g. the exercise name of a PR. */
  detail: z.string().max(80).optional(),
});
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

export const receiptMetaSchema = z.object({
  recipeId: z.string().optional(),
  recipeName: z.string().optional(),
  mealType: planSlotMealTypeSchema.optional(),
  slotIndex: z.number().int().optional(),
  prCount: z.number().int().optional(),
  weekStart: localDateSchema.optional(),
  /** Home-cooked count including this one ("Home-cooked dinner #37"). */
  cookCount: z.number().int().optional(),
});
export type ReceiptMeta = z.infer<typeof receiptMetaSchema>;

/** A ledger row as clients see it. */
export const receiptSchema = z.object({
  id: z.string(),
  kind: progressEventKindSchema,
  sourceId: z.string(),
  localDate: localDateSchema,
  /** XP actually awarded (after the daily soft cap). */
  xp: z.number().int(),
  lines: z.array(receiptLineSchema),
  /** True when the soft cap reduced this event's XP. */
  capped: z.boolean(),
  meta: receiptMetaSchema,
  createdAt: z.date(),
});
export type Receipt = z.infer<typeof receiptSchema>;

// ─── Settings (mockup 12, ideas 56–58) ────────────────────────────────────────

export const celebrationLevelSchema = z.enum(['FULL', 'SUBTLE', 'OFF']);
export type CelebrationLevel = z.infer<typeof celebrationLevelSchema>;

const reminderTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

export const progressSettingsSchema = z.object({
  /** Full party / Subtle / Off. Off still records everything. */
  celebrations: celebrationLevelSchema,
  /** "Show XP & levels" (idea 57: one toggle hides XP, levels, receipts). */
  showXp: z.boolean(),
  /** "Show my flame on Today". Off hides the strip; progress still counts. */
  showFlameOnToday: z.boolean(),
  /** Biscuit's one-line cameo on big moments (idea 44). */
  biscuit: z.boolean(),
  /** Gentle reminder (idea 58): mobile local notification, off by default (D6). */
  reminder: z.object({ enabled: z.boolean(), time: reminderTimeSchema }),
});
export type ProgressSettings = z.infer<typeof progressSettingsSchema>;

export const DEFAULT_PROGRESS_SETTINGS: ProgressSettings = {
  celebrations: 'FULL',
  showXp: true,
  showFlameOnToday: true,
  biscuit: true,
  reminder: { enabled: false, time: '19:30' },
};

export const progressSettingsPatchSchema = progressSettingsSchema
  .omit({ reminder: true })
  .partial()
  .extend({
    reminder: z.object({ enabled: z.boolean(), time: reminderTimeSchema }).partial().optional(),
  });
export type ProgressSettingsPatch = z.infer<typeof progressSettingsPatchSchema>;

// ─── Levels & ranks (ideas 1–3) ───────────────────────────────────────────────

export const RANK_IDS = [
  'KITCHEN_PORTER',
  'COMMIS',
  'LINE_COOK',
  'CHEF_DE_PARTIE',
  'SOUS_CHEF',
  'HEAD_CHEF',
  'EXECUTIVE_CHEF',
  'IRON_CHEF',
  'THREE_STAR',
] as const;
export const rankIdSchema = z.enum(RANK_IDS);
export type RankId = z.infer<typeof rankIdSchema>;

export const rankSchema = z.object({
  id: rankIdSchema,
  title: z.string(),
  minLevel: z.number().int(),
});
export type Rank = z.infer<typeof rankSchema>;

export const levelInfoSchema = z.object({
  /** Lifetime Chef XP. */
  total: z.number().int(),
  level: z.number().int().min(1),
  /** XP earned inside the current level. */
  xpIntoLevel: z.number().int(),
  /** XP the current level needs in total (80 + 60·level). */
  xpForLevel: z.number().int(),
});
export type LevelInfo = z.infer<typeof levelInfoSchema>;

// ─── The Flame (ideas 8–14, mockup 05) ────────────────────────────────────────

/** One weekday dot: done, a past quiet day (shown as rest ☾), today still open, or later this week. */
export const flameDayStateSchema = z.enum(['active', 'rest', 'today', 'future']);
export type FlameDayState = z.infer<typeof flameDayStateSchema>;

export const FLAME_MILESTONES = [4, 8, 12, 26, 52] as const;

export const flameInfoSchema = z.object({
  /** Weeks in a row the active-day goal was met (pilot lights and pauses keep it going). */
  current: z.number().int(),
  best: z.number().int(),
  pilotLights: z.number().int(),
  pilotLightMax: z.number().int(),
  /** Active-day goal in force this week (1–7, default 3). */
  goal: z.number().int().min(1).max(7),
  thisWeek: z.object({
    weekStart: localDateSchema,
    activeDays: z.number().int(),
    goal: z.number().int(),
    met: z.boolean(),
    /** Monday … Sunday. */
    days: z.array(flameDayStateSchema).length(7),
  }),
  /** The Flame is paused until this local date (inclusive), or null. */
  pausedUntil: localDateSchema.nullable(),
  /** The next milestone the Flame's best hasn't reached, or null after 52. */
  nextMilestone: z.number().int().nullable(),
  /** The gym weekly streak, shown as the Flame's training row (idea 13); null without a gym profile. */
  training: z.object({ current: z.number().int(), best: z.number().int() }).nullable(),
});
export type FlameInfo = z.infer<typeof flameInfoSchema>;

// ─── Today's three (idea 15, mockup 01) ───────────────────────────────────────

export const QUEST_KINDS = ['LOG_SLOT', 'COOK', 'PROTEIN', 'WORKOUT', 'SHOP', 'LOG_ANY'] as const;
export const questKindSchema = z.enum(QUEST_KINDS);
export type QuestKind = z.infer<typeof questKindSchema>;

export const todaysThreeQuestSchema = z.object({
  /** Stable within the day, e.g. "LOG_SLOT:breakfast". */
  id: z.string(),
  kind: questKindSchema,
  /** XP the underlying action earns (shown as "+10"). */
  xp: z.number().int(),
  mealType: planSlotMealTypeSchema.optional(),
  recipeId: z.string().optional(),
  recipeName: z.string().optional(),
  proteinTargetG: z.number().int().optional(),
  done: z.boolean(),
  /** e.g. protein so far vs target, for "62 g so far". */
  progress: z.object({ current: z.number(), target: z.number() }).optional(),
});
export type TodaysThreeQuest = z.infer<typeof todaysThreeQuestSchema>;

export const todaysThreeSchema = z.object({
  localDate: localDateSchema,
  quests: z.array(todaysThreeQuestSchema).max(3),
  bonusXp: z.number().int(),
  allDone: z.boolean(),
});
export type TodaysThree = z.infer<typeof todaysThreeSchema>;

// ─── Achievements (ideas 38–39, mockup 06) ────────────────────────────────────

export const ACHIEVEMENT_GROUPS = ['KITCHEN', 'TABLE', 'GYM', 'FLAME', 'PLAN'] as const;
export const achievementGroupSchema = z.enum(ACHIEVEMENT_GROUPS);
export type AchievementGroup = z.infer<typeof achievementGroupSchema>;

export const ACHIEVEMENT_IDS = [
  'WELCOME',
  'HOME_CHEF',
  'RECIPE_EXPLORER',
  'HONEST_LOGGER',
  'FULL_DAY',
  'PROTEIN_PRO',
  'PR_MACHINE',
  'IRON_WEEKS',
  'FLAME',
  'CLEAN_SWEEP',
  'TODAYS_THREE',
] as const;
export const achievementIdSchema = z.enum(ACHIEVEMENT_IDS);
export type AchievementId = z.infer<typeof achievementIdSchema>;

export const achievementItemSchema = z.object({
  id: achievementIdSchema,
  group: achievementGroupSchema,
  title: z.string(),
  /** What the next tier asks for, e.g. "Cook 50 meals in cook mode". */
  description: z.string(),
  icon: z.string(),
  /** Tiers earned so far (0 = none). */
  tier: z.number().int(),
  /** Thresholds, one per tier. */
  tiers: z.array(z.number().int()),
  /** Current count of the metric. */
  progress: z.number().int(),
  /** Threshold of the next tier, or null when every tier is earned. */
  nextTarget: z.number().int().nullable(),
  unlockedAt: z.date().nullable(),
  /** Earned and not yet seen on the shelf. */
  isNew: z.boolean(),
});
export type AchievementItem = z.infer<typeof achievementItemSchema>;

export const achievementsDtoSchema = z.object({
  /** Badges earned, counting each tier. */
  earned: z.number().int(),
  total: z.number().int(),
  closestNext: achievementItemSchema.nullable(),
  groups: z.array(
    z.object({ group: achievementGroupSchema, items: z.array(achievementItemSchema) }),
  ),
});
export type AchievementsDto = z.infer<typeof achievementsDtoSchema>;

export const unlockSchema = z.object({
  id: z.string(),
  achievementId: achievementIdSchema,
  tier: z.number().int(),
  title: z.string(),
  icon: z.string(),
  unlockedAt: z.date(),
});
export type Unlock = z.infer<typeof unlockSchema>;

// ─── Procedure inputs / outputs ───────────────────────────────────────────────

export const progressSummaryInputSchema = z.object({ localDate: localDateSchema });

export const progressSummarySchema = z.object({
  xp: levelInfoSchema,
  rank: rankSchema,
  nextRank: rankSchema.nullable(),
  flame: flameInfoSchema,
  /** Null when there is nothing real to suggest today. */
  todaysThree: todaysThreeSchema.nullable(),
  settings: progressSettingsSchema,
  /** Low-intake guard (idea 59): skip food celebrations and show the support card. */
  quiet: z.boolean(),
  /** The one-time "Welcome to the kitchen" card, until `markSeen({ intro: true })`. */
  intro: z.object({ backdatedXp: z.number().int(), badges: z.number().int() }).nullable(),
  /** A weekly recap ready to open (Sunday–Tuesday, not opened yet). */
  recap: z.object({ weekStart: localDateSchema }).nullable(),
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;

export const levelUpSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  rank: rankSchema,
  /** True when the new level starts a new Chef rank. */
  rankChanged: z.boolean(),
});
export type LevelUp = z.infer<typeof levelUpSchema>;

export const progressInboxSchema = z.object({
  receipts: z.array(receiptSchema),
  unlocks: z.array(unlockSchema),
  levelUp: levelUpSchema.nullable(),
  /** Pass back to `progress.ack` as `upTo`. */
  cursor: z.date().nullable(),
});
export type ProgressInbox = z.infer<typeof progressInboxSchema>;

export const progressAckInputSchema = z.object({
  upTo: z.date().nullable().optional(),
  unlockIds: z.array(z.string()).max(100).optional(),
  level: z.number().int().min(1).optional(),
});
export type ProgressAckInput = z.infer<typeof progressAckInputSchema>;

export const receiptForInputSchema = z.object({
  kind: z.enum(['WORKOUT', 'COOK']),
  sourceId: z.string().min(1).max(64),
});

export const finishCookInputSchema = z.object({
  /** Client UUID of this cook: retries and the offline queue are idempotent. */
  id: clientIdSchema,
  recipeId: z.string().min(1).max(64).nullable(),
  localDate: localDateSchema,
  startedAt: z.date().optional(),
  finishedAt: z.date(),
});
export type FinishCookInput = z.infer<typeof finishCookInputSchema>;

export const finishCookResultSchema = z.object({
  /** Null when Kitchen progress is off for the user (the cook is still recorded, D1). */
  receipt: receiptSchema.nullable(),
  unlocks: z.array(unlockSchema),
  levelUp: levelUpSchema.nullable(),
});
export type FinishCookResult = z.infer<typeof finishCookResultSchema>;

export const weeklyRecapInputSchema = z.object({ weekStart: localDateSchema });

export const weeklyRecapSchema = z.object({
  weekStart: localDateSchema,
  weekEnd: localDateSchema,
  cooked: z.number().int(),
  mealsLogged: z.number().int(),
  activeDays: z.number().int(),
  workouts: z.number().int(),
  /** Gym weekly goal, null without a gym profile. */
  workoutGoal: z.number().int().nullable(),
  prs: z.number().int(),
  newRecipes: z.number().int(),
  dishOfWeek: z
    .object({
      recipeId: z.string(),
      name: z.string(),
      imageUrl: z.string().nullable(),
      timesCooked: z.number().int(),
      rating: z.number().int().nullable(),
    })
    .nullable(),
  flame: z.object({ from: z.number().int(), to: z.number().int() }),
  xp: z.number().int(),
  level: z.object({ from: z.number().int(), to: z.number().int() }),
});
export type WeeklyRecap = z.infer<typeof weeklyRecapSchema>;

export const setActiveDayGoalInputSchema = z.object({
  goal: z.number().int().min(1).max(7),
  localDate: localDateSchema,
});

export const pauseFlameInputSchema = z.object({
  startDate: localDateSchema,
  weeks: z.number().int().min(1).max(4),
});

export const resumeFlameInputSchema = z.object({ localDate: localDateSchema });

export const progressMarkSeenInputSchema = z.object({
  intro: z.literal(true).optional(),
  recapWeek: localDateSchema.optional(),
  achievements: z.literal(true).optional(),
});
export type ProgressMarkSeenInput = z.infer<typeof progressMarkSeenInputSchema>;
