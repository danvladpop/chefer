import { TRPCError } from '@trpc/server';
import {
  dailyLogRepository,
  mealPlanRepository,
  SavedMealNameTakenError,
  savedMealRepository,
  type ISavedMealRepository,
  type LoggedMealEntry,
  type Prisma,
  type SavedMeal,
} from '@chefer/database';
import { SAVED_MEAL_LIMITS, SAVED_MEALS_COPY, type SavedMealView } from '@chefer/types';
import { savedMealTotals } from '@chefer/utils';
import { entriesOfMeal, parseSavedMealItems, toSavedMealItems } from '../tracker/saved-meals.js';

// ─── Saved meals (lane A2) ────────────────────────────────────────────────────
// Save one logged meal of a day as a named snapshot; list and delete them.
// Logging a saved meal is `trackerService.logSavedMeal`. Free for everyone.

export function toSavedMealView(row: SavedMeal): SavedMealView {
  const items = parseSavedMealItems(row.items);
  return {
    id: row.id,
    name: row.name,
    items,
    totals: savedMealTotals(items),
    lastLoggedAt: row.lastLoggedAt?.toISOString() ?? null,
  };
}

function dayDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export class SavedMealsService {
  constructor(private readonly repo: ISavedMealRepository = savedMealRepository) {}

  async list(userId: string): Promise<SavedMealView[]> {
    return (await this.repo.listByUser(userId)).map(toSavedMealView);
  }

  /** Snapshots what is logged for `mealType` on `date`. */
  async createFromDay(
    userId: string,
    input: { name: string; date: string; mealType: string },
  ): Promise<SavedMealView> {
    const log = await dailyLogRepository.findByDate(userId, dayDate(input.date));
    const entries = entriesOfMeal(
      (log?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [],
      input.mealType,
    );
    if (entries.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: SAVED_MEALS_COPY.nothingLogged });
    }
    if (entries.length > SAVED_MEAL_LIMITS.maxItems) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A saved meal holds up to ${SAVED_MEAL_LIMITS.maxItems} items.`,
      });
    }
    if ((await this.repo.countByUser(userId)) >= SAVED_MEAL_LIMITS.maxPerUser) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: SAVED_MEALS_COPY.tooMany });
    }
    const recipeIds = [
      ...new Set(entries.map((m) => m.recipeId).filter((id): id is string => !!id)),
    ];
    const recipes =
      recipeIds.length > 0 ? await mealPlanRepository.findRecipesByIds(recipeIds) : [];
    const items = toSavedMealItems(entries, new Map(recipes.map((r) => [r.id, r.name])));
    try {
      return toSavedMealView(
        await this.repo.create(userId, input.name, items as unknown as Prisma.InputJsonValue),
      );
    } catch (err) {
      if (err instanceof SavedMealNameTakenError) {
        throw new TRPCError({ code: 'CONFLICT', message: SAVED_MEALS_COPY.duplicateName });
      }
      throw err;
    }
  }

  async delete(userId: string, id: string): Promise<{ deleted: boolean }> {
    return { deleted: await this.repo.delete(userId, id) };
  }
}

export const savedMealsService = new SavedMealsService();
