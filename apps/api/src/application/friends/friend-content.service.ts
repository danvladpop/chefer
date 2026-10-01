import {
  blockRepository,
  chefProfileRepository,
  favouriteRecipeRepository,
  followRepository,
  friendRecipeRepository,
  mealPlanRepository,
  routineRepository,
  socialProfileRepository,
  workoutSessionRepository,
  type ChefProfile,
  type IBlockRepository,
  type IChefProfileRepository,
  type IFavouriteRecipeRepository,
  type IFollowRepository,
  type IFriendRecipeRepository,
  type IMealPlanRepository,
  type ISocialProfileRepository,
  type Recipe,
  type RoutineRepository,
  type WorkoutSessionRepository,
} from '@chefer/database';
import {
  FRIENDS_LIMITS,
  type ExerciseTrackingType,
  type FriendProfileDto,
  type FriendRecipeCard,
  type FriendRoutineDto,
  type FriendWeekDto,
  type FriendWorkoutDto,
  type NutritionTargets,
  type Page,
} from '@chefer/types';
import {
  decodeCursor,
  encodeCursor,
  firstBlockedField,
  localDateMinusDays,
  mondayUtcOf,
  ownerLocalDate,
  weekdayIndex,
} from '@chefer/utils';
import { profileNotAvailableError } from '../../lib/friends-errors.js';
import { renderableTrackingTypes } from '../gym/client-level.js';
import { resolveTargets } from '../preferences/preferences.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import {
  readSlots,
  toFriendProfileDto,
  toFriendRecipeCard,
  toFriendRoutineDto,
  toFriendWeekDto,
  toFriendWorkoutDto,
} from './friend-dto.mappers.js';
import type { SocialAccess } from './social-access.service.js';

// ─── Following: another user's content (implementation-plan.md §5) ────────────
// profile, week, recipes, routine, workouts. Authorization already happened:
// every caller arrives through `requireSocialAccess(scope)` and passes the
// resolved `SocialAccess` in (INV-1). Responses are built only by
// friend-dto.mappers.ts (INV-2).
//
// INV-4 — READ-ONLY. Nothing here writes to the owner's rows. In particular
// this never calls `MealPlanService.getForWeek` (it carries a plan forward on
// read), `assemblePlanDto`, `loadSafetyContext`, the cost estimator, tailoring,
// image priority, or `TargetsService.get` (it records target changes on read).
// The carry-forward the owner would see is rebuilt in memory only.
//
// "Today" and "this week" are the OWNER's (PRD FD-15, §7.3): computed in
// `ChefProfile.timeZone`, UTC when unset or unknown.

/** Effective daily targets for the owner, read-only (no change detection, no snapshot). */
export interface FriendTargetsReader {
  effective(ownerId: string, chefProfile: ChefProfile | null): Promise<NutritionTargets>;
}

/** `resolveTargets` + the lifter context: what `TargetsService.get` returns as `effective`, minus its writes. */
export const readOnlyTargets: FriendTargetsReader = {
  async effective(ownerId, chefProfile) {
    const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(ownerId, chefProfile);
    return resolveTargets(chefProfile, lifterBodyweightKg).effective;
  },
};

export interface FriendContentDeps {
  mealPlans: Pick<
    IMealPlanRepository,
    'findForWeek' | 'findFollowedTemplate' | 'findLatestWithDaysBefore' | 'findRecipesByIds'
  >;
  favourites: Pick<IFavouriteRecipeRepository, 'findSavedRecipeIds'>;
  chefProfiles: Pick<IChefProfileRepository, 'findByUserId'>;
  socialProfiles: Pick<ISocialProfileRepository, 'findMany'>;
  follows: Pick<IFollowRepository, 'counts'>;
  recipes: IFriendRecipeRepository;
  routines: Pick<RoutineRepository, 'findActiveWithExercises'>;
  sessions: Pick<WorkoutSessionRepository, 'listCompletedInLocalDateRange'>;
  targets: FriendTargetsReader;
  blocks: Pick<IBlockRepository, 'blockedIdsEither'>;
  now: () => Date;
}

const defaultDeps: FriendContentDeps = {
  mealPlans: mealPlanRepository,
  favourites: favouriteRecipeRepository,
  chefProfiles: chefProfileRepository,
  socialProfiles: socialProfileRepository,
  follows: followRepository,
  recipes: friendRecipeRepository,
  routines: routineRepository,
  sessions: workoutSessionRepository,
  targets: readOnlyTargets,
  blocks: blockRepository,
  now: () => new Date(),
};

export interface FriendRecipesQuery {
  search?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * F3.1 — recipe ids whose name, photo and source a follower must not see in
 * the owner's week, although the row itself isn't hidden:
 *   - a copy whose ORIGINAL was auto-hidden by moderation (PRD §9.3 hides the
 *     original; the owner's copy would otherwise carry its name and photo to
 *     every follower — PRD §13: copies are never re-shared);
 *   - a recipe written, or originally written, by someone the VIEWER blocked
 *     or is blocked by (FR-13: "you won’t see … their recipes");
 *   - a name or description that trips the word filter (PRD §9.4 checks only
 *     SHARED recipes on write; a shared PLAN shows names of recipes that never
 *     went through it, e.g. with `My recipes` off, or a renamed copy).
 * The card keeps its id and numbers, like any `Hidden recipe`.
 */
export async function withheldRecipeIds(
  viewerId: string,
  ownerId: string,
  recipes: readonly Recipe[],
  deps: {
    findRecipesByIds: (ids: string[]) => Promise<Recipe[]>;
    blockedIdsEither: (userId: string) => Promise<string[]>;
  },
): Promise<Set<string>> {
  const originIds = [
    ...new Set(recipes.flatMap((r) => (r.originRecipeId ? [r.originRecipeId] : []))),
  ];
  const [origins, blocked] = await Promise.all([
    originIds.length > 0 ? deps.findRecipesByIds(originIds) : Promise.resolve([]),
    deps.blockedIdsEither(viewerId),
  ]);
  const hiddenOrigins = new Set(origins.filter((o) => o.hiddenAt !== null).map((o) => o.id));
  const blockedSet = new Set(blocked);
  const withheld = new Set<string>();
  for (const r of recipes) {
    const author = r.source === 'MANUAL' && r.creatorId !== ownerId ? r.creatorId : null;
    if (
      (r.originRecipeId !== null && hiddenOrigins.has(r.originRecipeId)) ||
      (author !== null && blockedSet.has(author)) ||
      (r.originCreatorId !== null && blockedSet.has(r.originCreatorId)) ||
      firstBlockedField(r) !== null
    ) {
      withheld.add(r.id);
    }
  }
  return withheld;
}

function hasAnyMeal(days: readonly { meals: unknown }[]): boolean {
  return days.some((d) => readSlots(d.meals).length > 0);
}

export class FriendContentService {
  private readonly deps: FriendContentDeps;

  constructor(deps: Partial<FriendContentDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** The profile header + section access (`friends.profile`, scope `header`). */
  async profile(ownerId: string, access: SocialAccess): Promise<FriendProfileDto> {
    const [rows, counts, recipeCount] = await Promise.all([
      this.deps.socialProfiles.findMany([ownerId]),
      this.deps.follows.counts(ownerId),
      access.can.recipes === 'visible'
        ? this.deps.recipes.countShared(ownerId)
        : Promise.resolve(null),
    ]);
    const row = rows.find((r) => r.userId === ownerId);
    // Visible a moment ago, gone now (turned off mid-request): same answer as never visible (INV-3).
    if (!row) throw profileNotAvailableError();
    return toFriendProfileDto({
      user: row.user,
      profile: row,
      access,
      counts,
      recipeCount,
    });
  }

  /**
   * The owner's current week (`friends.week`, scope `plan`), §5 steps 1–6.
   * No plan this week → the followed template, else the latest earlier plan,
   * IN MEMORY (never `createPlan`), exactly what the owner's own next read
   * would carry forward. Nothing at all → `null`.
   */
  async week(
    viewerId: string,
    ownerId: string,
    access: SocialAccess,
  ): Promise<FriendWeekDto | null> {
    const chefProfile = await this.deps.chefProfiles.findByUserId(ownerId);
    const local = ownerLocalDate(this.deps.now(), chefProfile?.timeZone);
    const monday = mondayUtcOf(local);

    let days: readonly { dayOfWeek: number; meals: unknown }[] | null = null;
    const plan = await this.deps.mealPlans.findForWeek(ownerId, monday);
    if (plan) {
      days = plan.days;
    } else {
      const followed = await this.deps.mealPlans.findFollowedTemplate(ownerId);
      const source =
        followed ?? (await this.deps.mealPlans.findLatestWithDaysBefore(ownerId, monday));
      // Same condition as the owner's carry-forward: an empty source creates nothing.
      if (source && hasAnyMeal(source.days)) days = source.days;
    }
    if (!days) return null;

    const recipeIds = [
      ...new Set(days.flatMap((d) => readSlots(d.meals).map((slot) => slot.recipeId))),
    ];
    const [recipes, savedIds, targets] = await Promise.all([
      recipeIds.length > 0 ? this.deps.mealPlans.findRecipesByIds(recipeIds) : Promise.resolve([]),
      this.deps.favourites.findSavedRecipeIds(viewerId),
      access.can.targets
        ? this.deps.targets.effective(ownerId, chefProfile)
        : Promise.resolve(null),
    ]);

    const withheldIds = await withheldRecipeIds(viewerId, ownerId, recipes, {
      findRecipesByIds: (ids) => this.deps.mealPlans.findRecipesByIds(ids),
      blockedIdsEither: (id) => this.deps.blocks.blockedIdsEither(id),
    });

    return toFriendWeekDto({
      weekStartDate: monday.toISOString().slice(0, 10),
      todayIndex: weekdayIndex(local),
      ownerId,
      days,
      recipesById: new Map(recipes.map((r: Recipe) => [r.id, r])),
      savedIds: new Set(savedIds),
      targets,
      withheldIds,
    });
  }

  /**
   * The owner's shared recipes (`friends.recipes`, scope `recipes`): own MANUAL
   * recipes, written or imported, no copies, no auto-hidden ones (the
   * repository filters; hidden rows are dropped here again). Newest first,
   * keyset; a tampered cursor restarts at the top.
   */
  async recipes(
    viewerId: string,
    ownerId: string,
    query: FriendRecipesQuery = {},
  ): Promise<Page<FriendRecipeCard>> {
    const limit = Math.min(50, Math.max(1, query.limit ?? FRIENDS_LIMITS.pageSize));
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const search = query.search?.trim();
    const [rows, savedIds] = await Promise.all([
      this.deps.recipes.listShared(ownerId, {
        search: search === '' ? undefined : search,
        cursor: decoded ? { createdAt: decoded.date, id: decoded.id } : null,
        limit: limit + 1,
      }),
      this.deps.favourites.findSavedRecipeIds(viewerId),
    ]);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const saved = new Set(savedIds);
    return {
      items: page
        .filter((r) => r.hiddenAt === null && r.originRecipeId === null)
        .map((r) =>
          // Word filter at read too (F3.1): the blocked-terms list can grow
          // after a recipe was written; the owner's originals only, so no
          // origin/blocked-author lookup is needed here.
          toFriendRecipeCard(r, {
            ownerId,
            savedIds: saved,
            withheld: firstBlockedField(r) !== null,
          }),
        ),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /** The owner's active routine (`friends.routine`, scope `workouts`), or null. */
  async routine(ownerId: string, clientLevel: number): Promise<FriendRoutineDto | null> {
    const routine = await this.deps.routines.findActiveWithExercises(ownerId);
    if (!routine) return null;
    return toFriendRoutineDto(routine, renderableSet(clientLevel));
  }

  /**
   * Completed workouts of the last 7 days (`friends.workouts`, scope
   * `workouts`, PRD FD-15): local dates owner's-today − 6 … today, newest
   * first, at most 30, no cursor.
   */
  async workouts(ownerId: string, clientLevel: number): Promise<FriendWorkoutDto[]> {
    const chefProfile = await this.deps.chefProfiles.findByUserId(ownerId);
    const to = ownerLocalDate(this.deps.now(), chefProfile?.timeZone);
    const from = localDateMinusDays(to, FRIENDS_LIMITS.workoutsDays - 1);
    const sessions = await this.deps.sessions.listCompletedInLocalDateRange(
      ownerId,
      from,
      to,
      FRIENDS_LIMITS.workoutsMax,
    );
    const renderable = renderableSet(clientLevel);
    return sessions
      .filter((s) => s.status === 'COMPLETED' && s.localDate >= from && s.localDate <= to)
      .slice(0, FRIENDS_LIMITS.workoutsMax)
      .map((s) => toFriendWorkoutDto(s, renderable));
  }
}

function renderableSet(level: number): ReadonlySet<ExerciseTrackingType> {
  return new Set(renderableTrackingTypes(level));
}

export const friendContentService = new FriendContentService();
