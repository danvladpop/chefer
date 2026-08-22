import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  chefProfileRepository,
  dietaryPreferencesRepository,
  mealRatingRepository,
  prisma,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { aiService } from '../../lib/ai/index.js';
import type { ChatContext, ChatMessage, ChatTools } from '../../lib/ai/index.js';
import { getLimit, isPremiumUser } from '../../lib/entitlements.js';
import { assertAiSwapQuota } from '../../lib/quotas.js';
import { mealPlanService, type WeekPlanDto } from '../meal-plan/meal-plan.service.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { shoppingListService } from '../shopping-list/shopping-list.service.js';

// ─── AI chef chat (P1-4) ──────────────────────────────────────────────────────
// Replaces the web app's mock regex route. Every message gets a fresh context
// built from the user's REAL data (active plan, today's meals, targets,
// safety prefs, recent ratings), and the model can act through tools —
// swapping a meal actually swaps it in the plan.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0=Monday … 6=Sunday for today (matches dayOfWeek in plans). */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class ChatService {
  /**
   * Throws TOO_MANY_REQUESTS when a limited tier has used today's messages.
   * Premium (and admins) are unlimited per the PLAN_FEATURES matrix.
   */
  async assertChatQuota(user: UserProfile): Promise<void> {
    const limit = getLimit(user, 'chatMessagesPerDay');
    if (limit === null) return;
    const used = await prisma.aiCallLog.count({
      where: { userId: user.id, callType: AiCallType.CHAT, createdAt: { gte: startOfTodayUtc() } },
    });
    if (used >= limit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You've used today's ${limit} free chat messages. Upgrade for unlimited AI chef chat.`,
      });
    }
  }

  /**
   * Builds the prompt context from the user's live data. Kept as one plain
   * string so every AI implementation (Gemini, mock) sees exactly the same
   * facts.
   */
  async buildContextSummary(user: UserProfile, plan: WeekPlanDto | null): Promise<string> {
    const [profile, prefs, signals] = await Promise.all([
      chefProfileRepository.findByUserId(user.id),
      dietaryPreferencesRepository.findByUserId(user.id),
      mealRatingRepository.findSignalsForUser(user.id, 10),
    ]);

    const targets = resolveDailyTargets(profile);
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
      const todayIdx = getTodayDayIndex();
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
          `Today's plan totals: ${totals.calories} kcal, ${totals.protein}g protein, ${totals.carbs}g carbs, ${totals.fat}g fat.`,
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

    const liked = signals.filter((s) => s.rating >= 4).map((s) => s.recipeName);
    const disliked = signals.filter((s) => s.rating <= 2).map((s) => s.recipeName);
    if (liked.length) lines.push(`Recently liked (4-5 stars): ${liked.join(', ')}.`);
    if (disliked.length) lines.push(`Recently disliked (1-2 stars): ${disliked.join(', ')}.`);

    lines.push(`Days are indexed 0=Monday … 6=Sunday; today is ${DAY_NAMES[getTodayDayIndex()]}.`);
    return lines.join('\n');
  }

  /** Tool handlers over the real services — the chat can DO things (P1-4). */
  private buildTools(user: UserProfile, plan: WeekPlanDto | null): ChatTools {
    return {
      swapMeal: async ({ dayOfWeek, mealType }) => {
        if (!plan) return 'No active meal plan to swap in — generate a plan first.';
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          return 'Invalid day — use 0 (Monday) through 6 (Sunday).';
        }
        await assertAiSwapQuota(user);
        const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
        const before = day?.meals.find((m) => m.type === mealType)?.recipe.name;
        const swapped = await mealPlanService.swapRecipe(
          user.id,
          plan.planId,
          dayOfWeek,
          mealType,
          undefined,
          isPremiumUser(user),
        );
        return `Swapped ${DAY_NAMES[dayOfWeek]}'s ${mealType}${before ? ` (${before})` : ''} for "${swapped.name}" (${swapped.nutritionInfo.calories} kcal, ${swapped.nutritionInfo.protein}g protein). The meal plan is updated.`;
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
    await this.assertChatQuota(user);

    const plan = await mealPlanService.getActive(user.id);
    const contextSummary = await this.buildContextSummary(user, plan);

    prisma.aiCallLog
      .create({ data: { userId: user.id, callType: AiCallType.CHAT } })
      .catch((err) => console.error('[aiCallLog] Failed to log CHAT call:', err));

    const context: ChatContext = {
      userId: user.id,
      contextSummary,
      tools: this.buildTools(user, plan),
    };
    return aiService.chat(messages, context);
  }
}

export const chatService = new ChatService();
