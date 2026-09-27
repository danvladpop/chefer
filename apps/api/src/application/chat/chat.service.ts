import {
  chefProfileRepository,
  dailyLogRepository,
  dietaryPreferencesRepository,
  mealRatingRepository,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { isAiCapacityFailure } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type { ChatContext, ChatMessage, ChatTools } from '../../lib/ai/index.js';
import { isPremiumUser } from '../../lib/entitlements.js';
import { reserveAiSwap, reserveChatMessage } from '../../lib/quotas.js';
import { coachService } from '../coach/coach.service.js';
import { mealPlanService, type WeekPlanDto } from '../meal-plan/meal-plan.service.js';
import { pantryService } from '../pantry/pantry.service.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { recipeImportService } from '../recipe-import/recipe-import.service.js';
import { shoppingListService } from '../shopping-list/shopping-list.service.js';
import { trackerService } from '../tracker/tracker.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';

// ─── AI chef chat (P1-4) ──────────────────────────────────────────────────────
// Replaces the web app's mock regex route. Every message gets a fresh context
// built from the user's REAL data (active plan, today's meals, targets,
// safety prefs, recent ratings), and the model can act through tools —
// swapping a meal actually swaps it in the plan.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "first", "second", … for the swap confirmation (two-snack days). */
function ordinal(n: number): string {
  return ['first', 'second', 'third', 'fourth'][n - 1] ?? `#${n}`;
}

// ─── One local-day contract (T-21.1, §2.12, bugs B-06/B-33) ────────────────────
// The server has no time zone of its own — "today" for chat must be the
// USER's calendar day (`ChefProfile.timeZone`), not the server host's clock
// (UTC in production). Deriving the day from `Date#getDay` or an ISO
// timestamp's date portion silently used the server's day: a message sent
// at 11pm US-Pacific landed
// on tomorrow's log, a message sent just after midnight in Bucharest landed
// on yesterday's plan day. Falls back to UTC when the profile has never set
// a zone (unchanged behaviour for those accounts) — `setDisplayPreferences`
// (preferences, another lane) is what populates it.

/** The user's local calendar day as `YYYY-MM-DD`, from their IANA time zone. */
export function localDateInZone(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 0=Monday … 6=Sunday for the user's local today (matches dayOfWeek in plans). */
export function localDayIndexInZone(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): number {
  const [y, m, d] = localDateInZone(timeZone, now).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** UTC-midnight `Date` that keys the user's local calendar day (DailyLog's row key convention). */
function localDayKey(timeZone: string | null | undefined, now: Date = new Date()): Date {
  return new Date(`${localDateInZone(timeZone, now)}T00:00:00.000Z`);
}

export class ChatService {
  /**
   * Builds the prompt context from the user's live data. Kept as one plain
   * string so every AI implementation (Gemini, mock) sees exactly the same
   * facts.
   */
  async buildContextSummary(user: UserProfile, plan: WeekPlanDto | null): Promise<string> {
    // T-21.1: the user's own local day, not the server's — read before the
    // rest so `todayLog` looks up the right calendar day.
    const profile = await chefProfileRepository.findByUserId(user.id);
    const timeZone = profile?.timeZone;
    const todayIdx = localDayIndexInZone(timeZone);

    const [prefs, signals, todayLog] = await Promise.all([
      dietaryPreferencesRepository.findByUserId(user.id),
      mealRatingRepository.findSignalsForUser(user.id, 10),
      dailyLogRepository.findByDate(user.id, localDayKey(timeZone)),
    ]);

    const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(user.id, profile);
    const targets = resolveDailyTargets(profile, lifterBodyweightKg);
    const lines: string[] = ['USER CONTEXT (real data — answer from this):'];

    lines.push(
      `Daily targets: ${targets.dailyCalorieTarget} kcal, ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat.`,
    );

    if (prefs?.allergies.length)
      lines.push(`Allergies (never suggest): ${prefs.allergies.join(', ')}.`);
    if (prefs?.dietaryRestrictions.length)
      lines.push(`Dietary restrictions: ${prefs.dietaryRestrictions.join(', ')}.`);
    if (prefs?.dislikedIngredients.length)
      lines.push(`Dislikes: ${prefs.dislikedIngredients.join(', ')}.`);

    if (plan) {
      const today = plan.days.find((d) => d.dayOfWeek === todayIdx);
      if (today) {
        const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        const mealLines = today.meals.map((m) => {
          const n = m.recipe.nutritionInfo;
          totals.calories += n.calories;
          totals.protein += n.protein;
          totals.carbs += n.carbs;
          totals.fat += n.fat;
          return `  - ${m.type}: ${m.recipe.name} (${n.calories} kcal, ${n.protein}g protein, ${n.carbs}g carbs, ${n.fat}g fat)`;
        });
        lines.push(`Today (${DAY_NAMES[todayIdx]}) on the active plan:`, ...mealLines);
        lines.push(
          `Today's PLANNED totals (from the meal plan, not necessarily eaten): ${totals.calories} kcal, ${totals.protein}g protein, ${totals.carbs}g carbs, ${totals.fat}g fat.`,
        );
      }
      const weekDishes = plan.days
        .map(
          (d) =>
            `${DAY_NAMES[d.dayOfWeek]}: ${d.meals.map((m) => `${m.type} ${m.recipe.name}`).join(', ')}`,
        )
        .join('\n  ');
      lines.push(`Week overview:\n  ${weekDishes}`);
    } else {
      lines.push('No active meal plan for this week yet — suggest generating one.');
    }

    // Claim precision (review F-4): the model must never present planned food
    // as eaten food. Give it the logged truth and an explicit framing rule.
    if (todayLog && (todayLog.loggedMeals as unknown[]).length > 0) {
      lines.push(
        `Today's LOGGED intake (actually eaten and checked off): ${todayLog.totalKcal} kcal, ${todayLog.totalProtein}g protein, ${todayLog.totalCarbs}g carbs, ${todayLog.totalFat}g fat.`,
      );
    } else {
      lines.push('Nothing has been logged as eaten today.');
    }
    lines.push(
      'When answering questions about what the user is eating or ate, distinguish PLANNED (on the meal plan) from LOGGED (actually eaten). If nothing is logged, say the numbers come from the plan and nothing is logged yet — never state planned intake as fact.',
    );

    const liked = signals.filter((s) => s.rating >= 4).map((s) => s.recipeName);
    const disliked = signals.filter((s) => s.rating <= 2).map((s) => s.recipeName);
    if (liked.length) lines.push(`Recently liked (4-5 stars): ${liked.join(', ')}.`);
    if (disliked.length) lines.push(`Recently disliked (1-2 stars): ${disliked.join(', ')}.`);

    lines.push(`Days are indexed 0=Monday … 6=Sunday; today is ${DAY_NAMES[todayIdx]}.`);
    return lines.join('\n');
  }

  /** Tool handlers over the real services — the chat can DO things (P1-4). */
  private buildTools(user: UserProfile, plan: WeekPlanDto | null): ChatTools {
    return {
      swapMeal: async ({ dayOfWeek, mealType, occurrence }) => {
        if (!plan) return 'No active meal plan to swap in — generate a plan first.';
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          return 'Invalid day — use 0 (Monday) through 6 (Sunday).';
        }
        // A curated day can hold two snacks: `occurrence` (1-based, in plan
        // order) picks the slot and becomes swapRecipe's slotIndex (PR #42).
        // Validated before the quota reservation, so a miss costs nothing.
        const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
        const ofType = (day?.meals ?? [])
          .map((m, index) => ({ m, index }))
          .filter(({ m }) => m.type === mealType);
        let slotIndex: number | undefined;
        if (occurrence !== undefined) {
          if (!Number.isInteger(occurrence) || occurrence < 1) {
            return 'Invalid occurrence — use 1 for the first slot of that meal type, 2 for the second.';
          }
          const target = ofType[occurrence - 1];
          if (!target) {
            return `${DAY_NAMES[dayOfWeek]} has ${ofType.length === 0 ? 'no' : `only ${ofType.length}`} ${mealType} slot${ofType.length === 1 ? '' : 's'} — nothing to swap.`;
          }
          slotIndex = target.index;
        }
        const reservation = await reserveAiSwap(user);
        const before = (ofType[(occurrence ?? 1) - 1] ?? ofType[0])?.m.recipe.name;
        const swapped = await mealPlanService
          .swapRecipe(
            user.id,
            plan.planId,
            dayOfWeek,
            mealType,
            undefined,
            isPremiumUser(user),
            slotIndex,
          )
          .catch(async (err: unknown) => {
            await reservation.release();
            throw err;
          });
        const label = ofType.length > 1 ? `${ordinal(occurrence ?? 1)} ${mealType}` : mealType;
        return `Swapped ${DAY_NAMES[dayOfWeek]}'s ${label}${before ? ` (${before})` : ''} for "${swapped.name}" (${swapped.nutritionInfo.calories} kcal, ${swapped.nutritionInfo.protein}g protein). The meal plan is updated.`;
      },

      addToShoppingList: async ({ items }) => {
        if (!plan) return 'No active meal plan — generate a plan first, then I can add items.';
        if (!Array.isArray(items) || items.length === 0) return 'No items given.';
        const cleaned = items
          .map((i) => ({
            name: i.name.trim().slice(0, 80),
            ...(Number.isFinite(Number(i.quantity)) && Number(i.quantity) > 0
              ? { quantity: Number(i.quantity) }
              : {}),
            ...(i.unit ? { unit: i.unit.slice(0, 20) } : {}),
          }))
          .filter((i) => i.name.length > 0)
          .slice(0, 20);
        if (cleaned.length === 0) return 'No valid items given.';
        const { added } = await shoppingListService.addCustomItems(user.id, plan.planId, cleaned);
        return `Added to this week's shopping list: ${added.join(', ')}. The user can see and remove them on the Shopping List page.`;
      },

      getMyReview: async () => {
        const result = await coachService.getCurrentReview(user);
        if (result.status === 'none') {
          return result.daysNeeded > 0
            ? `No weekly review yet — the chef writes one every Sunday once at least 3 days of meals were logged that week. ${result.loggedDaysThisWeek} day(s) logged so far; ${result.daysNeeded} more needed.`
            : 'No weekly review yet — the first one is written on Sunday.';
        }
        if (result.status === 'teaser') {
          return `The latest review starts: "${result.firstLine}" — the full review and automatic target adjustments are part of premium (Adaptive Coaching). Suggest upgrading to read it.`;
        }
        const r = result.review;
        const trendLine =
          r.weightTrendKg != null
            ? `, weight trend ${r.weightTrendKg > 0 ? '+' : ''}${r.weightTrendKg.toFixed(2)} kg/week`
            : '';
        const adjLine =
          r.adjustmentKcal !== 0
            ? `, calorie budget adjusted by ${r.adjustmentKcal > 0 ? '+' : ''}${r.adjustmentKcal} kcal`
            : '';
        return `Latest chef review (week of ${r.weekStart.toISOString().slice(0, 10)}): adherence ${r.adherencePct}%, average ${r.avgDailyKcal} kcal/day${trendLine}${adjLine}.\n${r.reviewText}`;
      },

      logMeal: async ({ name, kcal, protein, carbs, fat, mealType }) => {
        // "I ate this" (F4): append a manual custom entry to TODAY's log.
        const cleanName = name.trim().slice(0, 200);
        if (!cleanName) return 'No dish name given.';
        if (!Number.isFinite(kcal) || kcal < 0 || kcal > 5000) {
          return 'Calories must be between 0 and 5000.';
        }
        const clampMacro = (v: number | undefined, max: number) =>
          Number.isFinite(v) ? Math.min(Math.max(v ?? 0, 0), max) : 0;
        const type = ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType ?? '')
          ? mealType!
          : 'snack';
        // T-21.1: the user's local "today", not the server's UTC day — a
        // late-evening "I ate X" must land on the day the user actually
        // means (bugs B-06/B-33).
        const profile = await chefProfileRepository.findByUserId(user.id);
        const today = localDateInZone(profile?.timeZone);
        const { rebalance } = await trackerService.logCustomMeal(user, today, {
          name: cleanName,
          estimatedBy: 'manual',
          mealType: type,
          kcal: Math.round(kcal),
          protein: clampMacro(protein, 500),
          carbs: clampMacro(carbs, 1000),
          fat: clampMacro(fat, 500),
        });
        const rebalanceNote = rebalance?.rebalanced
          ? ` I also adjusted ${rebalance.swaps.length} upcoming meal${rebalance.swaps.length > 1 ? 's' : ''} to keep the week on track — the meal plan shows the change (with undo).`
          : '';
        return `Logged "${cleanName}" (${Math.round(kcal)} kcal) as today's ${type}. It now counts toward today's progress in the tracker.${rebalanceNote}`;
      },

      importRecipe: async ({ url }) => {
        if (!/^https?:\/\//i.test(url)) return 'That does not look like a valid http(s) link.';
        try {
          const preview = await recipeImportService.preview(user, { url });
          if (!isPremiumUser(user)) {
            return `Extracted a preview of "${preview.original.name}" (${preview.changes.length} adaptation(s) possible for the user's preferences). Saving imported recipes is a premium feature — suggest the Import button on the Recipes page to see the preview, or upgrading to save it.`;
          }
          const useAdapted = preview.safety.ok && preview.changes.length > 0;
          const saved = await recipeImportService.save(user, {
            recipe: useAdapted ? preview.adapted : preview.original,
            variant: useAdapted ? 'adapted' : 'original',
            sourceUrl: preview.sourceUrl,
            ogImageUrl: preview.ogImageUrl,
          });
          const changeNote = useAdapted
            ? ` Cheferized with ${preview.changes.length} adaptation(s): ${preview.changes
                .map((c) => c.description)
                .slice(0, 4)
                .join('; ')}.`
            : ' No adaptations were needed.';
          return `Imported "${saved.name}" into the user's collection (Recipes page → My Recipes).${changeNote} They can rate it or pin it into next week's plan.`;
        } catch (err) {
          return `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`;
        }
      },

      whatCanIMake: async () => {
        // F3 pantry: coverage ranking over known recipes. PantryService
        // handles the tier branch (free gets an honest teaser).
        return pantryService.whatCanIMake(user);
      },

      scaleRecipe: async ({ recipeName, servings }) => {
        if (!plan) return 'No active meal plan — generate one first.';
        if (!Number.isFinite(servings) || servings < 1 || servings > 20) {
          return 'Servings must be between 1 and 20.';
        }
        const needle = recipeName.trim().toLowerCase();
        const recipe = plan.days
          .flatMap((d) => d.meals)
          .map((m) => m.recipe)
          .find((r) => r.name.toLowerCase().includes(needle));
        if (!recipe) return `No recipe matching "${recipeName}" in the active plan.`;
        const factor = servings / recipe.servings;
        const scaled = recipe.ingredients
          .map((i) => `${i.name}: ${Math.round(i.quantity * factor * 100) / 100} ${i.unit}`)
          .join('; ');
        return `"${recipe.name}" scaled from ${recipe.servings} to ${servings} serving(s): ${scaled}.`;
      },
    };
  }

  /**
   * Runs one chat turn: quota check, fresh context, tool-capable model call.
   * Returns the response text stream. The CHAT AiCallLog row is written up
   * front so the quota counts attempts, not just successes.
   */
  async chat(user: UserProfile, messages: ChatMessage[]): Promise<ReadableStream> {
    // Atomic reservation up front — the quota counts attempts (parallel
    // sends used to get 7 of 5 through — audit F-REC-4-2 family). A capacity
    // failure (every provider busy or out of free quota) is refunded: that
    // attempt was ours, not the user's.
    const reservation = await reserveChatMessage(user);

    const plan = await mealPlanService.getActive(user.id);
    const contextSummary = await this.buildContextSummary(user, plan);

    const context: ChatContext = {
      userId: user.id,
      contextSummary,
      tools: this.buildTools(user, plan),
    };
    try {
      return await aiService.chat(messages, context);
    } catch (err) {
      if (isAiCapacityFailure(err)) await reservation.release();
      throw err;
    }
  }
}

export const chatService = new ChatService();
