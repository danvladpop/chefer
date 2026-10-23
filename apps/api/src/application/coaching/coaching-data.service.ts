import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  parseSkippedSlots,
  userRepository,
  weightEntryRepository,
  type IChefProfileRepository,
  type IDailyLogRepository,
  type IMealPlanRepository,
  type IUserRepository,
  type IWeightEntryRepository,
  type LoggedMealEntry,
} from '@chefer/database';
import { COACHING_DATA_LIMITS, type ClientFoodDto, type ClientWeightDto } from '@chefer/types';
import {
  addDaysLocal,
  dbDateKey,
  foodDaySummary,
  trainerNumbersView,
  weekStartOf,
  weighInsByDay,
  type FoodLogEntryInput,
  type PlannedMealSlot,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { hasFeature } from '../../lib/entitlements.js';
import { planForDate } from '../meal-plan/plan-for-date.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import {
  trainingNutritionService,
  type TrainingNutritionService,
} from '../training-nutrition/training-nutrition.service.js';
import { linkShares, type CoachingAccess } from './coaching-access.service.js';

// ─── Trainer coaching: the client's shared food log and weight (lane K1) ──────
// What a trainer sees when the client turned "Share my food log" / "Share my
// weight" on. Only reached through `requireCoachingAccess('food' | 'weight')`
// (coaching-access.service.ts rule 3b), so every method here may assume the
// ACTIVE link and the matching switch — and re-checks it anyway.
//
// READ-ONLY on the client's data. It deliberately does NOT call
// `trackerService.getDay`: that read backfills entry ids and records target
// changes, and a trainer looking must never write to the client's records.
// Never returned: allergies, diet settings, photos, notes, carbs or fat.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC-midnight `Date` of a `YYYY-MM-DD` (the `@db.Date` key of daily_logs). */
const utcDay = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
/** 0 = Monday … 6 = Sunday. */
const weekdayOf = (localDate: string) => (utcDay(localDate).getUTCDay() + 6) % 7;

type PlanSlotJson = { type: string; recipeId: string };

export interface CoachingDataDeps {
  profiles: Pick<IChefProfileRepository, 'findByUserId'>;
  logs: Pick<IDailyLogRepository, 'findRange'>;
  plans: Pick<IMealPlanRepository, 'findForWeek' | 'findRecipesByIds'>;
  weights: Pick<IWeightEntryRepository, 'findInRange'>;
  users: Pick<IUserRepository, 'findById'>;
  training: Pick<TrainingNutritionService, 'loadLifter' | 'trainingWeek'>;
}

const defaultDeps: CoachingDataDeps = {
  profiles: chefProfileRepository,
  logs: dailyLogRepository,
  plans: mealPlanRepository,
  weights: weightEntryRepository,
  users: userRepository,
  training: trainingNutritionService,
};

export class CoachingDataService {
  private readonly deps: CoachingDataDeps;

  constructor(deps: Partial<CoachingDataDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * `trainer.client.food`: the last `days` days ending `today` (the trainer's
   * device-local date), never further back than COACHING_DATA_LIMITS.foodHistoryDays.
   */
  async food(access: CoachingAccess, today: string, days: number): Promise<ClientFoodDto> {
    const link = access.link;
    if (!link || !linkShares(link, 'food') || !link.shareFoodAt) throw clientUnavailableError();
    const clientId = access.clientId;
    const count = Math.min(Math.max(1, days), COACHING_DATA_LIMITS.foodHistoryDays);
    const dates = Array.from({ length: count }, (_, i) => addDaysLocal(today, i - count + 1));
    const first = dates[0] ?? today;

    const [profile, logs, client] = await Promise.all([
      this.deps.profiles.findByUserId(clientId),
      this.deps.logs.findRange(clientId, utcDay(first), utcDay(today)),
      this.deps.users.findById(clientId),
    ]);
    if (!client) throw clientUnavailableError();
    const view = trainerNumbersView(profile?.numbersMode);

    // One plan and one training week per calendar week in the window.
    const weeks = [...new Set(dates.map(weekStartOf))];
    const [{ lifterBodyweightKg }, plans, trainingWeeks] = await Promise.all([
      this.deps.training.loadLifter(clientId, profile),
      Promise.all(weeks.map((w) => planForDate(this.deps.plans, clientId, w))),
      Promise.all(
        weeks.map((w) =>
          this.deps.training.trainingWeek(
            clientId,
            profile,
            utcDay(w),
            hasFeature(client, 'trainingDayTargets'),
            true,
          ),
        ),
      ),
    ]);
    const base = resolveDailyTargets(profile, lifterBodyweightKg);
    const planByWeek = new Map(weeks.map((w, i) => [w, plans[i] ?? null]));
    const trainingByWeek = new Map(weeks.map((w, i) => [w, trainingWeeks[i] ?? null]));
    const logByDate = new Map(logs.map((l) => [dbDateKey(l.date), l]));

    const entriesByDate = new Map(
      dates.map((date) => [
        date,
        (logByDate.get(date)?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [],
      ]),
    );
    const recipeIds = [
      ...new Set(
        [...entriesByDate.values()].flatMap((entries) =>
          entries.flatMap((e) => (e.recipeId ? [e.recipeId] : [])),
        ),
      ),
    ];
    const names = new Map(
      (recipeIds.length > 0 ? await this.deps.plans.findRecipesByIds(recipeIds) : []).map((r) => [
        r.id,
        r.name,
      ]),
    );

    return {
      numbers: view,
      sharedSince: link.shareFoodAt.toISOString(),
      days: dates.map((date) => {
        const week = weekStartOf(date);
        const weekday = weekdayOf(date);
        const log = logByDate.get(date) ?? null;
        const planDay = planByWeek.get(week)?.days.find((d) => d.dayOfWeek === weekday);
        const planned: PlannedMealSlot[] | null = planDay
          ? ((planDay.meals as PlanSlotJson[] | null) ?? []).map((slot, slotIndex) => ({
              type: slot.type,
              recipeId: slot.recipeId,
              slotIndex,
            }))
          : null;
        const bump = trainingByWeek
          .get(week)
          ?.trainingDays.find((d) => d.dayOfWeek === weekday && d.applied);
        const logged: FoodLogEntryInput[] = (entriesByDate.get(date) ?? []).map((e) => ({
          // Allow-list: only what the summary needs, never the raw entry.
          ...(e.recipeId !== undefined && { recipeId: e.recipeId }),
          ...(e.custom !== undefined && { custom: e.custom }),
          ...(e.slotIndex !== undefined && { slotIndex: e.slotIndex }),
          ...(e.replacesSlot !== undefined && { replacesSlot: e.replacesSlot }),
          mealType: e.mealType,
          name: e.custom?.name ?? (e.recipeId ? names.get(e.recipeId) : undefined) ?? 'Logged meal',
          kcal: e.kcal,
          protein: e.protein,
        }));
        return foodDaySummary(
          {
            date,
            planned,
            logged,
            skipped: log ? parseSkippedSlots(log.skippedSlots) : [],
            totals: log ? { kcal: log.totalKcal, protein: log.totalProtein } : null,
            target: {
              kcal: base.dailyCalorieTarget + (bump?.kcalBonus ?? 0),
              proteinG: base.proteinG + (bump?.proteinBonus ?? 0),
            },
          },
          view,
        );
      }),
    };
  }

  /** `trainer.client.weight`: one weigh-in per day for the last COACHING_DATA_LIMITS.weightHistoryDays days. */
  async weight(access: CoachingAccess, today: string): Promise<ClientWeightDto> {
    const link = access.link;
    if (!link || !linkShares(link, 'weight') || !link.shareWeightAt) {
      throw clientUnavailableError();
    }
    const from = addDaysLocal(today, -(COACHING_DATA_LIMITS.weightHistoryDays - 1));
    // A day of slack either side of the window for the client's time zone; the
    // day filter below trims it back to the window.
    const entries = await this.deps.weights.findInRange(
      access.clientId,
      new Date(utcDay(from).getTime() - DAY_MS),
      new Date(utcDay(today).getTime() + 2 * DAY_MS),
    );
    // TODO(lane D1): serve the trend weight next to the raw weigh-ins once it is on master.
    return {
      sharedSince: link.shareWeightAt.toISOString(),
      entries: weighInsByDay(entries, from).filter((e) => e.date <= addDaysLocal(today, 1)),
    };
  }
}

export const coachingDataService = new CoachingDataService();
