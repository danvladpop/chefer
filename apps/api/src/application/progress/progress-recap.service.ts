import {
  cookLogRepository,
  mealPlanRepository,
  mealRatingRepository,
  workoutSessionRepository,
  type CookLog,
  type GymProfile,
  type ICookLogRepository,
  type IMealPlanRepository,
  type IMealRatingRepository,
  type WorkoutSessionRepository,
} from '@chefer/database';
import type { WeeklyRecap } from '@chefer/types';
import { addDaysLocal, dateOnlyKey, goalForWeek, levelForXp, weekStartOf } from '@chefer/utils';
import { gymContextLoader } from '../gym/gym-context.js';
import { readGoalHistory } from '../gym/mappers.js';
import type { ProgressRecorder } from './progress-recorder.js';
import { progressRecorder } from './progress-recorder.js';

// ─── Weekly recap (docs/gamification-2026-10/tech-plan.md §4.3, mockup 10) ────
// One factual page per week, built from the ledger, the cook log, the week's
// finished workouts and the gym goal. It is a read: nothing is written.

export type RecapDeps = {
  recorder: Pick<ProgressRecorder, 'deps' | 'flame' | 'userToday'>;
  cookLogs: Pick<ICookLogRepository, 'listInRange'>;
  ratings: Pick<IMealRatingRepository, 'findByUserAndRecipe'>;
  plans: Pick<IMealPlanRepository, 'findRecipesByIds'>;
  workouts: Pick<WorkoutSessionRepository, 'listCompletedInLocalDateRange'>;
  gymProfile: (userId: string) => Promise<GymProfile | null>;
};

export class ProgressRecapService {
  private resolved: RecapDeps | null = null;

  constructor(private readonly overrides: Partial<RecapDeps> = {}) {}

  private get deps(): RecapDeps {
    this.resolved ??= {
      recorder: progressRecorder,
      cookLogs: cookLogRepository,
      ratings: mealRatingRepository,
      plans: mealPlanRepository,
      workouts: workoutSessionRepository,
      gymProfile: async (userId) => (await gymContextLoader.load(userId)).profileRow,
      ...this.overrides,
    };
    return this.resolved;
  }

  async weeklyRecap(userId: string, weekStartInput: string): Promise<WeeklyRecap> {
    const d = this.deps;
    const weekStart = weekStartOf(weekStartInput);
    const weekEnd = addDaysLocal(weekStart, 6);
    const [stats, cooks, workouts, profile] = await Promise.all([
      d.recorder.deps.events.weekStats(userId, weekStart),
      d.cookLogs.listInRange(userId, weekStart, weekEnd),
      d.workouts.listCompletedInLocalDateRange(userId, weekStart, weekEnd, 30),
      d.gymProfile(userId),
    ]);

    const levelFrom = levelForXp(stats.xpBefore).level;
    const levelTo = levelForXp(stats.xpBefore + stats.xp).level;
    // The Flame as it stood when the week started and when it ended: the week
    // before / the week itself is the cut-off, and "today" is the Monday after
    // it, so that week is settled (met, flexed or missed) rather than in progress.
    const [from, to] = await Promise.all([
      d.recorder.flame.read(userId, weekStart, levelFrom, { cutoff: addDaysLocal(weekStart, -1) }),
      d.recorder.flame.read(userId, addDaysLocal(weekStart, 7), levelTo, { cutoff: weekEnd }),
    ]);

    return {
      weekStart,
      weekEnd,
      cooked: stats.cooked,
      mealsLogged: stats.mealsLogged,
      activeDays: stats.activeDates.length,
      workouts: workouts.length,
      workoutGoal: profile ? gymGoalFor(profile, weekStart) : null,
      prs: stats.prs,
      newRecipes: stats.newRecipes,
      dishOfWeek: await this.dishOfWeek(userId, cooks),
      flame: { from: from.current, to: to.current },
      xp: stats.xp,
      level: { from: levelFrom, to: levelTo },
    };
  }

  /** The most-cooked recipe of the week; a tie goes to the one rated highest. */
  private async dishOfWeek(userId: string, cooks: CookLog[]): Promise<WeeklyRecap['dishOfWeek']> {
    const d = this.deps;
    const counts = new Map<string, number>();
    for (const cook of cooks) {
      if (cook.recipeId) counts.set(cook.recipeId, (counts.get(cook.recipeId) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    const most = Math.max(...counts.values());
    const tied = [...counts].filter(([, n]) => n === most).map(([id]) => id);
    const rated = await Promise.all(
      tied.map(async (recipeId) => ({
        recipeId,
        rating: (await d.ratings.findByUserAndRecipe(userId, recipeId))?.rating ?? null,
      })),
    );
    const best = rated.reduce((a, b) => ((b.rating ?? 0) > (a.rating ?? 0) ? b : a));
    const [recipe] = await d.plans.findRecipesByIds([best.recipeId]);
    if (!recipe) return null;
    return {
      recipeId: recipe.id,
      name: recipe.name,
      imageUrl: recipe.imageUrl ?? null,
      timesCooked: most,
      rating: best.rating,
    };
  }
}

/** The gym weekly goal in force that week (the Monday the recap is about). */
function gymGoalFor(profile: GymProfile, weekStart: string): number {
  const history = readGoalHistory(profile.goalHistory);
  // Only the fallback week of a profile with no goal history: the setup
  // instant's calendar day is close enough (the goal is per week).
  const setup = dateOnlyKey(profile.setupCompletedAt ?? profile.createdAt);
  return goalForWeek(
    history.length > 0 ? history : [{ fromWeek: weekStartOf(setup), goal: profile.weeklyGoal }],
    weekStart,
  );
}

export const progressRecapService = new ProgressRecapService();
