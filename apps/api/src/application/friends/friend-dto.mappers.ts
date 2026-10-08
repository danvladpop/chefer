import type {
  Recipe,
  RoutineRepository,
  SocialProfile,
  SocialUserRow,
  WorkoutSessionRepository,
} from '@chefer/database';
import {
  FRIENDS_COPY,
  type ExerciseTrackingType,
  type FriendMacroTotals,
  type FriendProfileDto,
  type FriendRecipeCard,
  type FriendRoutineDto,
  type FriendUserSummary,
  type FriendWeekDto,
  type FriendWorkoutDto,
  type NutritionTargets,
} from '@chefer/types';
import {
  containsBlockedTerm,
  dayTotals,
  displayNameOf,
  firstNameOf,
  relationOf,
  slotPortion,
  slotTotals,
  sourceDomainOf,
  weekAverageKcal,
  type NutritionLike,
} from '@chefer/utils';
import type { SocialAccess } from './social-access.service.js';

// ─── Following: allow-list DTO mappers (implementation-plan.md §1 INV-2, §5) ──
// The ONLY place another user's rows become a response. Every DTO is built
// field by field from the row; nothing is spread — not a row, not an own-data
// DTO (`WeekPlanDto`, `RoutineDto`, `SessionSummaryDto`), not a slot's JSON.
// A field that isn't written out here never reaches a follower, whatever is
// added to the schema later. friend-dto.mappers.test.ts asserts the exact
// deep key set of every DTO built from a fully populated owner.
//
// Never mapped (PRD §7.2): email, allergies/diets/safety, notes, cost, pinned,
// heart rate, RPE, prescription, deload, swaps, warm-up sets.

/** Max `durationMin` (10 h): a session left running overnight isn't a 19-hour workout. */
export const FRIEND_WORKOUT_MAX_DURATION_MIN = 600;

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type FriendMealType = (typeof MEAL_TYPES)[number];
const IMAGE_STATUSES = ['PENDING', 'GENERATING', 'DONE', 'FAILED'] as const;

type FriendWeekDay = FriendWeekDto['days'][number];
type FriendWeekMeal = FriendWeekDay['meals'][number];

export type FriendRoutineRow = NonNullable<
  Awaited<ReturnType<RoutineRepository['findActiveWithExercises']>>
>;
export type FriendSessionRow = Awaited<
  ReturnType<WorkoutSessionRepository['listCompletedInLocalDateRange']>
>[number];

// ─── Small readers (untrusted JSON / numbers) ─────────────────────────────────

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Only the four macro fields of a recipe's `nutritionInfo` JSON. */
export function readNutrition(json: unknown): NutritionLike {
  if (!json || typeof json !== 'object') return {};
  const n = json as Record<string, unknown>;
  return {
    calories: finiteOr(n['calories'], 0),
    protein: finiteOr(n['protein'], 0),
    carbs: finiteOr(n['carbs'], 0),
    fat: finiteOr(n['fat'], 0),
  };
}

function isMealType(value: unknown): value is FriendMealType {
  return typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value);
}

/** One stored slot (`MealPlanDay.meals[i]`), reduced to what a follower may see. */
export interface FriendSlot {
  type: FriendMealType;
  recipeId: string;
  portion: number | undefined;
  leftoverOf: string | undefined;
}

/**
 * Reads a day's `meals` JSON into the allow-listed slot fields. Anything that
 * isn't a valid slot is skipped; `pinned` and any other key are never read.
 */
export function readSlots(json: unknown): FriendSlot[] {
  if (!Array.isArray(json)) return [];
  const slots: FriendSlot[] = [];
  for (const raw of json as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const type = s['type'];
    const recipeId = s['recipeId'];
    if (!isMealType(type) || typeof recipeId !== 'string' || recipeId === '') continue;
    const portion = s['portion'];
    const leftoverOf = s['leftoverOf'];
    slots.push({
      type,
      recipeId,
      portion: typeof portion === 'number' ? portion : undefined,
      leftoverOf: typeof leftoverOf === 'string' && leftoverOf !== '' ? leftoverOf : undefined,
    });
  }
  return slots;
}

function macros(t: FriendMacroTotals): FriendMacroTotals {
  return { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat };
}

// ─── People ───────────────────────────────────────────────────────────────────

/** The header person. `user` is a `socialUserSelect` row (never has `email`). */
export function toFriendUserSummary(
  user: SocialUserRow,
  access: Pick<SocialAccess, 'isSelf' | 'outgoing' | 'incoming'>,
): FriendUserSummary {
  const names = { firstName: user.firstName, lastName: user.lastName, name: user.name };
  return {
    id: user.id,
    displayName: displayNameOf(names),
    firstName: firstNameOf(names),
    imageUrl: user.image ?? null,
    relation: relationOf({ isSelf: access.isSelf, outgoing: access.outgoing }),
    followsYou: !access.isSelf && access.incoming === 'ACCEPTED',
    requestedYou: !access.isSelf && access.incoming === 'PENDING',
  };
}

export function toFriendProfileDto(input: {
  user: SocialUserRow;
  profile: Pick<SocialProfile, 'visibility'>;
  access: SocialAccess;
  counts: { followers: number; following: number };
  recipeCount: number | null;
}): FriendProfileDto {
  const { access } = input;
  return {
    user: toFriendUserSummary(input.user, access),
    isSelf: access.isSelf,
    visibility: input.profile.visibility,
    counts: { followers: input.counts.followers, following: input.counts.following },
    access: { plan: access.can.plan, recipes: access.can.recipes, workouts: access.can.workouts },
    recipeCount: access.can.recipes === 'visible' ? input.recipeCount : null,
  };
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

/**
 * A recipe card. `ownerId` is the profile owner (for `byOwner`); `savedIds`
 * are the VIEWER's hearts. An auto-hidden recipe (PRD §9) keeps its id and
 * numbers but withholds name, photo and source: `Hidden recipe`, no image.
 * `withheld` renders a card the same way for a reason the row itself doesn't
 * carry (F3.1, see `withheldRecipeIds` in friend-content.service.ts).
 */
export function toFriendRecipeCard(
  recipe: Recipe,
  ctx: { ownerId: string; savedIds: ReadonlySet<string>; withheld?: boolean },
): FriendRecipeCard {
  const hidden = recipe.hiddenAt !== null || ctx.withheld === true;
  const perServing = slotTotals(readNutrition(recipe.nutritionInfo), 1);
  const imageStatus = (IMAGE_STATUSES as readonly string[]).includes(recipe.imageStatus)
    ? recipe.imageStatus
    : 'DONE';
  return {
    id: recipe.id,
    name: hidden ? FRIENDS_COPY.food.hiddenRecipe : recipe.name,
    imageUrl: hidden ? null : (recipe.imageUrl ?? null),
    imageStatus: hidden ? 'DONE' : imageStatus,
    perServing: macros(perServing),
    totalTimeMins: Math.max(0, finiteOr(recipe.prepTimeMins, 0) + finiteOr(recipe.cookTimeMins, 0)),
    // A copy of someone else's recipe is not "by" the owner (plan §5 byOwner,
    // narrowed: the follower can't open a copy anyway, recipe-access.ts).
    byOwner:
      recipe.source === 'MANUAL' &&
      recipe.creatorId === ctx.ownerId &&
      recipe.originRecipeId === null,
    sourceDomain: hidden ? null : sourceDomainOf(recipe.sourceUrl),
    sourceUrl: hidden ? null : sourceDomainOf(recipe.sourceUrl) ? (recipe.sourceUrl ?? null) : null,
    isFavourite: ctx.savedIds.has(recipe.id),
    hidden,
  };
}

// ─── Week ─────────────────────────────────────────────────────────────────────

export interface FriendWeekInput {
  weekStartDate: string;
  todayIndex: number;
  ownerId: string;
  /** The plan's days (any order, any subset of 0..6). */
  days: readonly { dayOfWeek: number; meals: unknown }[];
  recipesById: ReadonlyMap<string, Recipe>;
  savedIds: ReadonlySet<string>;
  targets: NutritionTargets | null;
  /** Recipe ids shown as `Hidden recipe` although their own row isn't hidden (F3.1). */
  withheldIds?: ReadonlySet<string>;
}

/**
 * The owner's week as a follower sees it: always 7 days (Mon..Sun), each slot
 * → `{ type, portion, leftoverOf?, recipe card, totals }`. A slot whose recipe
 * row is missing is dropped. Totals use the owner's own maths (`sumPlanDay`).
 */
export function toFriendWeekDto(input: FriendWeekInput): FriendWeekDto {
  const byDay = new Map<number, unknown>();
  for (const d of input.days) {
    if (Number.isInteger(d.dayOfWeek) && d.dayOfWeek >= 0 && d.dayOfWeek <= 6) {
      if (!byDay.has(d.dayOfWeek)) byDay.set(d.dayOfWeek, d.meals);
    }
  }
  const days: FriendWeekDay[] = [];
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    const meals: FriendWeekMeal[] = [];
    const totalsInput: { nutrition: NutritionLike; portion: number }[] = [];
    for (const slot of readSlots(byDay.get(dayOfWeek))) {
      const recipe = input.recipesById.get(slot.recipeId);
      if (!recipe) continue;
      const portion = slotPortion(slot.portion);
      const nutrition = readNutrition(recipe.nutritionInfo);
      const meal: FriendWeekMeal = {
        type: slot.type,
        portion,
        recipe: toFriendRecipeCard(recipe, {
          ownerId: input.ownerId,
          savedIds: input.savedIds,
          withheld: input.withheldIds?.has(recipe.id) === true,
        }),
        totals: macros(slotTotals(nutrition, portion)),
      };
      if (slot.leftoverOf !== undefined) meal.leftoverOf = slot.leftoverOf;
      meals.push(meal);
      totalsInput.push({ nutrition, portion });
    }
    days.push({ dayOfWeek, meals, totals: macros(dayTotals(totalsInput)) });
  }
  return {
    weekStartDate: input.weekStartDate,
    todayIndex: input.todayIndex,
    days,
    averageKcal: weekAverageKcal(days),
    targets: input.targets ? toFriendTargets(input.targets) : null,
  };
}

/** The owner's effective daily targets, as macros (only when `can.targets`). */
export function toFriendTargets(t: NutritionTargets): FriendMacroTotals {
  return {
    kcal: Math.round(t.dailyCalorieTarget),
    protein: Math.round(t.proteinG),
    carbs: Math.round(t.carbsG),
    fat: Math.round(t.fatG),
  };
}

// ─── Gym ──────────────────────────────────────────────────────────────────────

/**
 * Free text a follower sees on the Gym tab (routine, day, workout and custom
 * exercise names) never went through the word filter, which only checks names
 * and shared recipes (PRD §9.4). A hit is replaced by a neutral label (F3.1).
 */
function filtered(text: string, fallback: string): string {
  return containsBlockedTerm(text) ? fallback : text;
}

/** A custom exercise's name, filtered; curated library names are ours and pass as they are. */
function exerciseName(exercise: { name: string; ownerId: string | null }): string {
  return exercise.ownerId === null
    ? exercise.name
    : filtered(exercise.name, FRIENDS_COPY.gym.filtered.exercise);
}

/**
 * The active routine: days in order with their exercises (`sets × reps`, rest,
 * superset). Exercises of a tracking type the client can't render are dropped
 * (the gym.* rule, application/gym/client-level.ts). No notes, no target RIR.
 */
export function toFriendRoutineDto(
  routine: FriendRoutineRow,
  renderable: ReadonlySet<ExerciseTrackingType>,
): FriendRoutineDto {
  return {
    name: filtered(routine.name, FRIENDS_COPY.gym.routine),
    days: [...routine.days]
      .sort((a, b) => a.position - b.position)
      .map((day) => ({
        position: day.position,
        name: filtered(day.name, FRIENDS_COPY.gym.filtered.day(day.position + 1)),
        plannedWeekday: day.plannedWeekday ?? null,
        exercises: [...day.exercises]
          .sort((a, b) => a.position - b.position)
          .filter((e) => renderable.has(e.exercise.trackingType))
          .map((e) => ({
            exerciseId: e.exercise.id,
            name: exerciseName(e.exercise),
            isCustom: e.exercise.ownerId !== null,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            restSec: e.restSec,
            supersetGroup: e.supersetGroup ?? null,
            trackingType: e.exercise.trackingType,
          })),
      })),
  };
}

/** Minutes between start and finish, rounded, capped at 600; null when unfinished. */
export function friendDurationMin(startedAt: Date, finishedAt: Date | null): number | null {
  if (!finishedAt) return null;
  const ms = finishedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(FRIEND_WORKOUT_MAX_DURATION_MIN, Math.round(ms / 60_000));
}

/**
 * One completed workout. Skipped exercises, exercises of a non-renderable
 * tracking type and exercises with no working set are omitted; a set is a
 * working set when it was completed and isn't a warm-up. Sets carry only load,
 * reps and (cardio) duration/distance — never RPE, heart rate or any other
 * cardio extra; the exercise never carries notes, prescription or swap.
 */
export function toFriendWorkoutDto(
  session: FriendSessionRow,
  renderable: ReadonlySet<ExerciseTrackingType>,
): FriendWorkoutDto {
  const exercises: FriendWorkoutDto['exercises'] = [];
  for (const e of [...session.exercises].sort((a, b) => a.position - b.position)) {
    if (e.skipped) continue;
    if (!renderable.has(e.exercise.trackingType)) continue;
    const sets: FriendWorkoutDto['exercises'][number]['sets'] = [];
    for (const s of [...e.sets].sort((a, b) => a.position - b.position)) {
      if (s.completedAt === null || s.isWarmup) continue;
      const set: (typeof sets)[number] = { weightKg: s.weightKg, reps: s.reps };
      if (s.durationSec !== null) set.durationSec = s.durationSec;
      if (s.distanceM !== null) set.distanceM = s.distanceM;
      sets.push(set);
    }
    if (sets.length === 0) continue;
    exercises.push({
      exerciseId: e.exercise.id,
      name: exerciseName(e.exercise),
      isCustom: e.exercise.ownerId !== null,
      trackingType: e.exercise.trackingType,
      // UX-GYM-19: from the exercise itself (catalog or a custom one), so a
      // friend's per-hand lift reads "30 kg each". Omitted when false.
      ...(e.exercise.perHand && { perHand: true }),
      sets,
    });
  }
  return {
    id: session.id,
    name: filtered(session.name, FRIENDS_COPY.gym.filtered.workout),
    localDate: session.localDate,
    startedAt: session.startedAt.toISOString(),
    durationMin: friendDurationMin(session.startedAt, session.finishedAt),
    exercises,
  };
}
