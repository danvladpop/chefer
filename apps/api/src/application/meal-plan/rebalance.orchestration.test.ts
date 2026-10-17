import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository, mealPlanRepository } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { PROTEIN_SNACKS } from '@chefer/utils';
import { CURATED_POOL_BY_TYPE } from '../../lib/curated-recipes/index.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { applyRebalanceSwaps, previewRebalance, rebalanceWeek } from './rebalance.js';
import { rebalanceService } from './rebalance.service.js';

// WP-07 — the orchestration around the pure selection, with mocked
// repositories (CI has no DB). Covers: the slot model (replaced = eaten with
// the replacement's numbers, skipped = neither), preview writes nothing, apply
// guards (stale / unsafe / pinned / not future), the auto path of shipped
// clients, and — the owner's rule "Premium = heavy AI only" — NO AI call.

// Any touch of the AI service on this path fails the test.
const aiTouched = vi.fn();
vi.mock('../../lib/ai/index.js', () => ({
  aiService: new Proxy(
    {},
    {
      get: (_t, prop) => {
        aiTouched(String(prop));
        throw new Error('AI must not be called on the rebalance path');
      },
    },
  ),
}));

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  mealPlanRepository: {
    findByIdForUser: vi.fn(),
    findRecipesByIds: vi.fn(),
    updateDayMeal: vi.fn(),
    findForWeek: vi.fn(),
  },
  chefProfileRepository: { findByUserId: vi.fn() },
  dailyLogRepository: { findLastN: vi.fn() },
}));

vi.mock('../safety/safety.service.js', () => ({
  safetyService: {
    loadContext: vi.fn().mockResolvedValue({
      prefs: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
      hiddenRecipeIds: [],
    }),
  },
}));

vi.mock('../training-nutrition/training-nutrition.service.js', () => ({
  trainingNutritionService: {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
    refuelSnacks: vi.fn(),
  },
}));

vi.mock('../../lib/curated-recipes/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/curated-recipes/index.js')>()),
  ensureCuratedRecipes: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Wednesday 30 Sep 2026 (index 2). Monday is 28 Sep. The plan week matches.

const TODAY = '2026-09-30';
const PLAN_ID = 'plan-1';
const MONDAY = new Date('2026-09-28T00:00:00Z');

const POOL = Object.values(CURATED_POOL_BY_TYPE).flat();
const byId = new Map(POOL.map((r) => [r.id, r]));
const row = (id: string) => {
  const r = byId.get(id);
  if (!r) throw new Error(`fixture recipe ${id} is not in the curated pool`);
  return { id: r.id, name: r.name, nutritionInfo: r.nutritionInfo };
};

// A deliberately LOW-protein day: 1 594 kcal, 33.8 g protein.
const DAY = [
  { type: 'breakfast', recipeId: 'curated-cur-b-104' }, // 435 / 9.1
  { type: 'lunch', recipeId: 'curated-cur-l-104' }, // 450 / 12
  { type: 'dinner', recipeId: 'curated-cur-d-108' }, // 513 / 9.8
  { type: 'snack', recipeId: 'curated-cur-s-104' }, // 196 / 2.9
];

const user = (planTier: 'FREE' | 'PREMIUM' = 'FREE') =>
  ({ id: 'u1', planTier, role: 'USER' }) as unknown as UserProfile;

// Heavy dinners (759 kcal) leave room for the calorie swaps to bite.
const HEAVY_DAY = DAY.map((m) =>
  m.type === 'dinner' ? { ...m, recipeId: 'curated-cur-d-112' } : m,
);
const HEAVY_WEEK = { 2: HEAVY_DAY, 3: HEAVY_DAY, 4: HEAVY_DAY, 5: HEAVY_DAY, 6: HEAVY_DAY };

interface Scenario {
  goal?: string;
  /** Week projection vs the kcal target, as a fraction (0.0 = on target). */
  kcalDeviation?: number;
  /** Weekly protein still missing (g). */
  proteinGapG?: number;
  todayEntries?: unknown[];
  todaySkipped?: { mealType: string; slotIndex: number }[];
  /** Overrides the plan's meals per day (default: DAY everywhere). */
  meals?: Record<number, { type: string; recipeId: string; pinned?: boolean }[]>;
  /** An entry on Monday with protein logged as unknown. */
  unknownProtein?: boolean;
}

const profileFor = (goal: string) => ({ goal, dailyCalorieTarget: 2000 });
const dailyTargets = (goal = 'MAINTAIN') => resolveDailyTargets(profileFor(goal) as never);

function wire(sc: Scenario = {}) {
  const goal = sc.goal ?? 'MAINTAIN';
  const targets = dailyTargets(goal);
  const weeklyKcal = targets.dailyCalorieTarget * 7;
  const weeklyProtein = targets.proteinG * 7;
  // Wed (today, still to eat) … Sun: what the plan still has on the table.
  const planned = [2, 3, 4, 5, 6].flatMap((d) => sc.meals?.[d] ?? DAY).map((m) => row(m.recipeId));
  const plannedKcal = planned.reduce((s, r) => s + r.nutritionInfo.calories, 0);
  const plannedProtein = planned.reduce((s, r) => s + r.nutritionInfo.protein, 0);
  const consumedKcal = weeklyKcal * (1 + (sc.kcalDeviation ?? 0)) - plannedKcal;
  const consumedProtein = weeklyProtein - (sc.proteinGapG ?? 0) - plannedProtein;

  vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(profileFor(goal) as never);
  vi.mocked(mealPlanRepository.findByIdForUser).mockResolvedValue({
    id: PLAN_ID,
    weekStartDate: MONDAY,
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      meals: sc.meals?.[dayOfWeek] ?? DAY,
    })),
  } as never);
  vi.mocked(mealPlanRepository.findRecipesByIds).mockImplementation(
    async (ids: string[]) => ids.map(row) as never,
  );
  vi.mocked(mealPlanRepository.updateDayMeal).mockResolvedValue(undefined);
  const day = (
    iso: string,
    kcal: number,
    protein: number,
    entries: unknown[] = [],
    skipped: { mealType: string; slotIndex: number }[] = [],
  ) => ({
    date: new Date(`${iso}T00:00:00Z`),
    totalKcal: Math.round(kcal),
    totalProtein: protein,
    loggedMeals: entries,
    skippedSlots: skipped,
  });
  const logs = [
    day(
      '2026-09-28',
      consumedKcal / 2,
      consumedProtein / 2,
      sc.unknownProtein
        ? [
            {
              custom: { name: 'x', estimatedBy: 'manual' },
              mealType: 'snack',
              unknownMacros: ['protein'],
            },
          ]
        : [],
    ),
    day('2026-09-29', consumedKcal / 2, consumedProtein / 2),
  ];
  if (sc.todayEntries || sc.todaySkipped) {
    // Today's log: its totals are what the entries total to.
    const entries = (sc.todayEntries ?? []) as { kcal: number; protein: number }[];
    logs[1] = day('2026-09-29', consumedKcal / 2, consumedProtein / 2);
    logs.push(
      day(
        TODAY,
        entries.reduce((s, e) => s + e.kcal, 0),
        entries.reduce((s, e) => s + e.protein, 0),
        entries,
        sc.todaySkipped ?? [],
      ),
    );
  }
  vi.mocked(dailyLogRepository.findLastN).mockResolvedValue(logs as never);
  vi.mocked(trainingNutritionService.refuelSnacks).mockReturnValue(
    PROTEIN_SNACKS.map(({ id, name, proteinG, kcal, carbsG, fatG }) => ({
      id,
      name,
      proteinG,
      kcal,
      carbsG,
      fatG,
    })),
  );
  return { weeklyKcal, weeklyProtein, targets };
}

beforeEach(() => {
  vi.clearAllMocks();
  aiTouched.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('previewRebalance — protein-aware, writes nothing', () => {
  it('a −36 g week on a loss goal is offered a protein swap, not bigger portions', async () => {
    const { targets } = wire({ goal: 'LOSE_WEIGHT', proteinGapG: 36 });
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });

    expect(preview).not.toBeNull();
    expect(preview!.headline).toContain('36 g short on protein');
    expect(preview!.swaps.length).toBeGreaterThan(0);
    for (const swap of preview!.swaps) {
      expect(swap.reason).toBe('protein');
      expect(swap.dayOfWeek).toBeGreaterThan(2); // future days only
      expect(swap.newProteinG! - swap.previousProteinG!).toBeGreaterThanOrEqual(8);
      expect(swap.explanation).toMatch(/^\w+day \w+ → .+ \(\+\d+ g protein/);
    }
    // UX-PLAN-08: the swaps together add ≤ 10 % of a day's calories.
    const added = preview!.swaps.reduce((s, w) => s + (w.newKcal! - w.previousKcal!), 0);
    expect(added).toBeLessThanOrEqual(0.1 * targets.dailyCalorieTarget);
    expect(preview!.week.protein!.gapAfterG).toBeLessThan(preview!.week.protein!.gapG);
    // Nothing was written.
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('offers safe protein snacks when swaps cannot close the gap', async () => {
    wire({ goal: 'LOSE_WEIGHT', proteinGapG: 300 }); // far more than two swaps can fix
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    expect(preview!.snacks.length).toBe(2);
    expect(preview!.snacks.every((s) => s.proteinG > 0 && s.kcal > 0)).toBe(true);
    expect(trainingNutritionService.refuelSnacks).toHaveBeenCalled();
  });

  it('a week on target with enough protein has nothing to offer', async () => {
    wire({ proteinGapG: 0 });
    expect(await previewRebalance('u1', PLAN_ID, { localDate: TODAY })).toBeNull();
  });

  it('a 900 kcal snack on a heavy week gets a preview with calorie swaps', async () => {
    wire({ kcalDeviation: 0.18, meals: HEAVY_WEEK });
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    expect(preview!.swaps.length).toBeGreaterThan(0);
    expect(preview!.swaps.length).toBeLessThanOrEqual(2);
    expect(['calories', 'both']).toContain(preview!.swaps[0]!.reason);
    expect(preview!.week.projectedDeviationAfter).toBeLessThan(preview!.week.projectedDeviation);
    expect(preview!.headline).toMatch(/kcal over for the week/);
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('does not judge protein when a logged entry has unknown protein', async () => {
    wire({ proteinGapG: 36, unknownProtein: true });
    expect(await previewRebalance('u1', PLAN_ID, { localDate: TODAY })).toBeNull();
  });

  it('never offers anything on Sunday or for another week', async () => {
    wire({ proteinGapG: 100 });
    expect(await previewRebalance('u1', PLAN_ID, { localDate: '2026-10-04' })).toBeNull();
    expect(await previewRebalance('u1', PLAN_ID, { localDate: '2026-10-07' })).toBeNull();
  });

  it('skips "Your pick" slots', async () => {
    wire({
      proteinGapG: 60,
      meals: {
        3: DAY.map((m) => ({ ...m, pinned: true })),
        4: DAY.map((m) => ({ ...m, pinned: true })),
        5: DAY.map((m) => ({ ...m, pinned: true })),
        6: DAY.map((m) => ({ ...m, pinned: true })),
      },
    });
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    expect(preview?.swaps ?? []).toHaveLength(0);
  });
});

describe('the slot model (WP-06): replaced = eaten with the replacement, skipped = neither', () => {
  const baseline = async (sc: Scenario) => {
    wire({ proteinGapG: 100, ...sc });
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    return preview!.week.projectedKcal;
  };

  it('today’s planned slots count; replaced and skipped ones leave the "still to eat" total', async () => {
    const open = await baseline({ todayEntries: [] });
    // Skipped lunch: neither eaten nor remaining.
    const skipped = await baseline({ todaySkipped: [{ mealType: 'lunch', slotIndex: 1 }] });
    expect(open - skipped).toBe(450);
    // Replaced dinner: the replacement's numbers are in the day's log TOTAL
    // (the entry) and the planned dinner leaves the remaining total.
    const replaced = await baseline({
      todayEntries: [
        {
          custom: { name: 'Shawarma', estimatedBy: 'manual' },
          mealType: 'dinner',
          replacesSlot: { mealType: 'dinner', slotIndex: 2 },
          portionMultiplier: 1,
          kcal: 775,
          protein: 40,
          carbs: 0,
          fat: 0,
        },
      ],
    });
    // open counts dinner at 513 and has no entry; replaced counts 775 logged and no dinner.
    expect(replaced - open).toBe(775 - 513);
  });

  it('an eaten recipe is not counted twice (logged total + remaining)', async () => {
    const open = await baseline({ todayEntries: [] });
    const eaten = await baseline({
      todayEntries: [
        {
          recipeId: 'curated-cur-d-108',
          mealType: 'dinner',
          slotIndex: 2,
          portionMultiplier: 1,
          kcal: 513,
          protein: 9.8,
          carbs: 0,
          fat: 0,
        },
      ],
    });
    expect(eaten).toBe(open); // 513 moved from "remaining" to "logged"
  });
});

describe('rebalanceWeek — the apply-at-once path shipped clients keep', () => {
  it('applies the kcal swaps and returns the same shape as before', async () => {
    wire({ kcalDeviation: 0.2, meals: HEAVY_WEEK });
    const result = await rebalanceWeek('u1', PLAN_ID, { localDate: TODAY });
    expect(result.rebalanced).toBe(true);
    expect(result.planId).toBe(PLAN_ID);
    expect(result.projectedDeviation).toBeGreaterThan(0.15);
    expect(result.swaps.length).toBeGreaterThan(0);
    for (const swap of result.swaps) {
      expect(swap).toMatchObject({
        previousRecipeId: expect.any(String),
        newRecipeId: expect.any(String),
        previousRecipeName: expect.any(String),
        newRecipeName: expect.any(String),
      });
    }
    expect(mealPlanRepository.updateDayMeal).toHaveBeenCalledTimes(result.swaps.length);
    const [planId, day, type, newId, portion, slotIndex] = vi.mocked(
      mealPlanRepository.updateDayMeal,
    ).mock.calls[0]!;
    expect([planId, day, type, newId, portion]).toEqual([
      PLAN_ID,
      result.swaps[0]!.dayOfWeek,
      result.swaps[0]!.mealType,
      result.swaps[0]!.newRecipeId,
      undefined,
    ]);
    expect(slotIndex).toBe(result.swaps[0]!.slotIndex);
  });

  it('a protein gap alone never rewrites the week unprompted (old trigger rules)', async () => {
    wire({ goal: 'LOSE_WEIGHT', proteinGapG: 80 });
    const result = await rebalanceWeek('u1', PLAN_ID, { localDate: TODAY });
    expect(result).toEqual({
      rebalanced: false,
      swaps: [],
      projectedDeviation: expect.any(Number),
    });
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('is a no-op for a plan that is not the current week', async () => {
    wire({ kcalDeviation: 0.3 });
    const result = await rebalanceWeek('u1', PLAN_ID, { localDate: '2026-10-07' });
    expect(result.rebalanced).toBe(false);
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });
});

describe('applyRebalanceSwaps — the user accepted a preview', () => {
  const swapFor = async (sc: Scenario = { proteinGapG: 60 }) => {
    wire(sc);
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    return preview!.swaps[0]!;
  };

  it('applies the previewed swap and returns an undo-able result', async () => {
    const swap = await swapFor();
    const result = await applyRebalanceSwaps('u1', PLAN_ID, [swap], { localDate: TODAY });
    expect(result.rebalanced).toBe(true);
    expect(result.planId).toBe(PLAN_ID);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]).toMatchObject({
      dayOfWeek: swap.dayOfWeek,
      mealType: swap.mealType,
      slotIndex: swap.slotIndex,
      previousRecipeId: swap.previousRecipeId, // what Undo restores
      newRecipeId: swap.newRecipeId,
    });
    expect(result.swaps[0]!.explanation).toBeTruthy();
    expect(mealPlanRepository.updateDayMeal).toHaveBeenCalledWith(
      PLAN_ID,
      swap.dayOfWeek,
      swap.mealType,
      swap.newRecipeId,
      undefined,
      swap.slotIndex,
    );
  });

  it('skips a stale swap: the slot no longer holds the recipe the preview saw', async () => {
    const swap = await swapFor();
    const result = await applyRebalanceSwaps(
      'u1',
      PLAN_ID,
      [{ ...swap, previousRecipeId: 'something-the-user-changed-to' }],
      { localDate: TODAY },
    );
    expect(result.rebalanced).toBe(false);
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('never writes a recipe that is not one of the user’s safe curated alternatives', async () => {
    const swap = await swapFor();
    for (const newRecipeId of ['user-recipe-with-peanuts', 'curated-nonexistent']) {
      const result = await applyRebalanceSwaps('u1', PLAN_ID, [{ ...swap, newRecipeId }], {
        localDate: TODAY,
      });
      expect(result.rebalanced).toBe(false);
    }
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('never touches today or a past day, whatever the client sends', async () => {
    const swap = await swapFor();
    for (const dayOfWeek of [0, 2]) {
      const result = await applyRebalanceSwaps('u1', PLAN_ID, [{ ...swap, dayOfWeek }], {
        localDate: TODAY,
      });
      expect(result.rebalanced).toBe(false);
    }
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });

  it('applies each slot at most once', async () => {
    const swap = await swapFor();
    const result = await applyRebalanceSwaps('u1', PLAN_ID, [swap, swap], { localDate: TODAY });
    expect(result.swaps).toHaveLength(1);
    expect(mealPlanRepository.updateDayMeal).toHaveBeenCalledTimes(1);
  });
});

describe('rebalanceService — the feature gate', () => {
  it('a Free user can preview and apply (weekRebalance is free)', async () => {
    wire({ proteinGapG: 60 });
    const preview = await rebalanceService.preview(user('FREE'), {
      planId: PLAN_ID,
      localDate: TODAY,
    });
    expect(preview?.swaps.length).toBeGreaterThan(0);
    const applied = await rebalanceService.apply(user('FREE'), {
      planId: PLAN_ID,
      swaps: preview!.swaps,
      localDate: TODAY,
    });
    expect(applied.rebalanced).toBe(true);
  });
});

describe('no AI on the rebalance path ("Premium is for heavy AI only")', () => {
  it('preview, apply and auto rebalance never touch the AI service', async () => {
    wire({ goal: 'LOSE_WEIGHT', proteinGapG: 60, kcalDeviation: 0.2, meals: HEAVY_WEEK });
    const preview = await previewRebalance('u1', PLAN_ID, { localDate: TODAY });
    await applyRebalanceSwaps('u1', PLAN_ID, preview!.swaps, { localDate: TODAY });
    await rebalanceWeek('u1', PLAN_ID, { localDate: TODAY });
    expect(aiTouched).not.toHaveBeenCalled();
  });

  it('the rebalance modules do not even import the AI service or an AI quota', () => {
    for (const file of ['rebalance.ts', 'rebalance.service.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/lib\/ai\/index|aiService|reserveAi|lib\/quotas|AiCallLog/);
    }
  });
});
