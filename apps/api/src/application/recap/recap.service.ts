import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  type IChefProfileRepository,
  type IDailyLogRepository,
  type IMealPlanRepository,
} from '@chefer/database';
import type { WeeklyRecapDto } from '@chefer/types';
import {
  lastCompletedWeekStart,
  mondayOf,
  recapFoodCounts,
  weekLabel,
  weekStartForDate,
  type LoggedMealRef,
  type PlannedMealSlot,
} from '@chefer/utils';
import { gymStatsService, type GymStatsService } from '../gym/gym-stats.service.js';
import { serverToday } from '../gym/mappers.js';
import { resolveTargets } from '../preferences/preferences.service.js';

// ─── Weekly recap (market review 2026-10, lane E2) ───────────────────────────
// "Your week in review" for one Monday–Sunday week: meals cooked from the
// plan, protein-target days and new recipes tried, plus the week's sessions,
// PRs and the training streak. The counting rules are pure (`recapFoodCounts`,
// `@chefer/utils`); this service only loads the rows. Reached from the Monday
// email and Today on Monday, and the source of the recap share card.

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_RECIPES_SHOWN = 5;

type GymWeek = Pick<GymStatsService, 'weekRecap'>;

export class RecapService {
  constructor(
    private readonly logs: Pick<
      IDailyLogRepository,
      'findInRange' | 'findRecipeIdsLoggedBefore'
    > = dailyLogRepository,
    private readonly plans: Pick<
      IMealPlanRepository,
      'findForWeek' | 'findRecipesByIds'
    > = mealPlanRepository,
    private readonly profiles: Pick<IChefProfileRepository, 'findByUserId'> = chefProfileRepository,
    private readonly gym: GymWeek = gymStatsService,
  ) {}

  async week(
    userId: string,
    input: { weekStart?: string | undefined; localDate?: string | undefined } = {},
  ): Promise<WeeklyRecapDto> {
    const today = input.localDate ?? serverToday();
    const weekStart = input.weekStart ? mondayOf(input.weekStart) : lastCompletedWeekStart(today);
    const from = new Date(`${weekStart}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 7 * DAY_MS);

    const [logs, earlier, plan, profile, gym] = await Promise.all([
      this.logs.findInRange(userId, from, to),
      this.logs.findRecipeIdsLoggedBefore(userId, from),
      this.plans.findForWeek(userId, weekStartForDate(weekStart)),
      this.profiles.findByUserId(userId),
      this.gym.weekRecap(userId, weekStart, today),
    ]);

    const targets = profile ? resolveTargets(profile) : null;
    const hasProteinTarget =
      targets !== null && (targets.source === 'own' || targets.inputs.goal !== null);

    const counts = recapFoodCounts({
      logs: logs.map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        loggedMeals: Array.isArray(log.loggedMeals)
          ? (log.loggedMeals as unknown as LoggedMealRef[])
          : [],
        totalProtein: log.totalProtein,
      })),
      plan: plan
        ? plan.days.map((day) => ({
            dayOfWeek: day.dayOfWeek,
            meals: Array.isArray(day.meals) ? (day.meals as unknown as PlannedMealSlot[]) : [],
          }))
        : null,
      earlierRecipeIds: earlier,
      proteinTargetG: hasProteinTarget ? targets.effective.proteinG : null,
    });

    const shownIds = counts.newRecipeIds.slice(0, NEW_RECIPES_SHOWN);
    const recipes = shownIds.length > 0 ? await this.plans.findRecipesByIds(shownIds) : [];
    const names = new Map(recipes.map((r) => [r.id, r.name]));

    const loggedSomething = logs.some(
      (log) => Array.isArray(log.loggedMeals) && log.loggedMeals.length > 0,
    );
    return {
      weekStart,
      label: weekLabel(from),
      food: {
        plannedMeals: counts.plannedMeals,
        cookedFromPlan: counts.cookedFromPlan,
        newRecipesTried: counts.newRecipeIds.length,
        newRecipes: shownIds.flatMap((id) => {
          const name = names.get(id);
          return name ? [{ id, name }] : [];
        }),
        proteinDays: counts.proteinDays,
      },
      gym,
      empty: !loggedSomething && (gym?.sessions ?? 0) === 0,
    };
  }
}

export const recapService = new RecapService();
