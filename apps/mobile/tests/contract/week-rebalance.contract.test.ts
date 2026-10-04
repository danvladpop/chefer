import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr, mergePendingRebalance, undoOperations } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-07: the week rebalance is FREE (no AI), protein-aware, and shows a
// preview before it changes the week. Against the REAL API through the app's
// own tRPC link, on ONE throwaway account that is Free for every assertion
// (the goal is set while the Premium toggle is on, then switched off — the
// profile setup is a premium action). Weekday-independent: every probe uses
// this week's MONDAY as the client's local day, so there are always six
// future days to rebalance, whatever day the suite runs.
//
// Old clients (no `rebalanceMode`) must keep today's behaviour: the log
// response carries `rebalance` and no `rebalancePreview`.

const { client, setToken } = makeContractClient();

const now = new Date();
const mondayDate = new Date(now);
mondayDate.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
const MONDAY = localDateStr(mondayDate);

const HEAVY_DINNER = 'curated-cur-d-112'; // 759 kcal, 47 g protein
// Low-protein dishes: a week of these is far short on protein.
const LOW_PROTEIN = {
  breakfast: 'curated-cur-b-104', // 435 kcal, 9 g
  lunch: 'curated-cur-l-104', // 450 kcal, 12 g
  dinner: 'curated-cur-d-108', // 513 kcal, 10 g
  snack: 'curated-cur-s-104', // 196 kcal, 3 g
} as const;
const FUTURE_DAYS = [1, 2, 3, 4, 5, 6];

let planId = '';

type Week = Awaited<ReturnType<typeof client.mealPlan.getForWeek.query>>;
const recipeAt = (week: Week, dayOfWeek: number, type: string): string | undefined =>
  week?.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals.find((m) => m.type === type)?.recipe.id;
const readWeek = () => client.mealPlan.getForWeek.query({ weekOffset: 0 });

/** The value, or a clear failure (the contract suites avoid `!`). */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const asMealType = (value: string): MealType => {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack') {
    return value;
  }
  throw new Error(`unexpected meal type ${value}`);
};

/** Puts `recipeId` into every future day's `mealType` slot, NOT pinned (a pinned slot is never rebalanced). */
async function setFuture(mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', recipeId: string) {
  for (const dayOfWeek of FUTURE_DAYS) {
    await client.mealPlan.replaceRecipe.mutate({
      planId,
      dayOfWeek,
      mealType,
      recipeId,
      pinned: false,
    });
  }
}

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('week-rebalance'),
    password: 'Contract@123!',
    firstName: 'Rebal',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);

  // A loss goal (the profile setup is premium: flip it on for this one call).
  await client.user.upgradePlan.mutate();
  await client.preferences.setup.mutate({
    goal: 'LOSE_WEIGHT',
    biologicalSex: 'FEMALE',
    age: 35,
    heightCm: 165,
    weightKg: 68,
    activityLevel: 'SEDENTARY',
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    mealsPerDay: 4,
  });
  await client.user.downgradePlan.mutate();
  const me = await client.user.me.query();
  expect(me.planTier).toBe('FREE');

  const plan = await client.mealPlan.generate.mutate({ weekOffset: 0 });
  planId = plan.planId;
}, 60_000);

describe('a Free user logs a 900 kcal snack: preview, apply, plan changes, undo', () => {
  let preview: Awaited<ReturnType<typeof client.mealPlan.previewRebalance.query>>;

  it('the logs themselves change nothing in preview mode', async () => {
    await setFuture('dinner', HEAVY_DINNER);
    const before = await readWeek();
    for (const [name, kcal, mealType] of [
      ['Big lunch out', 2500, 'lunch'],
      ['Big dinner out', 2500, 'dinner'],
      ['Chocolate and crisps', 900, 'snack'],
    ] as const) {
      const out = await client.tracker.logCustomMeal.mutate({
        date: MONDAY,
        name,
        estimatedBy: 'manual',
        mealType,
        kcal,
        rebalanceMode: 'preview',
      });
      // Preview mode: nothing was applied, the response says so.
      expect(out.rebalance).toBeNull();
      expect(out).toHaveProperty('rebalancePreview');
    }
    const after = await readWeek();
    expect(FUTURE_DAYS.map((d) => recipeAt(after, d, 'dinner'))).toEqual(
      FUTURE_DAYS.map((d) => recipeAt(before, d, 'dinner')),
    );
  });

  it('previewRebalance lists up to two swaps, each with a one-line explanation, and writes nothing', async () => {
    preview = await client.mealPlan.previewRebalance.query({ planId, localDate: MONDAY });
    const offer = must(preview, 'a rebalance preview');
    expect(offer.swaps.length).toBeGreaterThanOrEqual(1);
    expect(offer.swaps.length).toBeLessThanOrEqual(2);
    expect(offer.headline).toMatch(/kcal over for the week/);
    expect(offer.week.projectedDeviation).toBeGreaterThan(0.15);
    expect(offer.week.projectedDeviationAfter).toBeLessThan(offer.week.projectedDeviation);
    for (const swap of offer.swaps) {
      expect(swap.dayOfWeek).toBeGreaterThan(0); // never Monday (today)
      expect(swap.explanation).toMatch(/^\w+day \w+ → .+ \(.*(kcal|protein)/);
    }
    const week = await readWeek();
    expect(FUTURE_DAYS.map((d) => recipeAt(week, d, 'dinner'))).toEqual(
      FUTURE_DAYS.map(() => HEAVY_DINNER),
    );
  });

  it('applyRebalance changes the plan, and the result drives Undo through replaceRecipe', async () => {
    const offer = must(preview, 'a rebalance preview');
    const result = await client.mealPlan.applyRebalance.mutate({
      planId,
      localDate: MONDAY,
      swaps: offer.swaps.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        mealType: asMealType(s.mealType),
        ...(s.slotIndex !== undefined && { slotIndex: s.slotIndex }),
        previousRecipeId: s.previousRecipeId,
        newRecipeId: s.newRecipeId,
      })),
    });
    expect(result.rebalanced).toBe(true);
    expect(result.planId).toBe(planId);
    expect(result.swaps).toHaveLength(offer.swaps.length);

    const changed = await readWeek();
    for (const swap of result.swaps) {
      expect(recipeAt(changed, swap.dayOfWeek, swap.mealType)).toBe(swap.newRecipeId);
      expect(swap.newRecipeId).not.toBe(HEAVY_DINNER);
    }

    // Undo exactly as the apps do (packages/utils/src/rebalance.ts).
    const pending = must(mergePendingRebalance(null, result), 'a pending rebalance');
    for (const op of undoOperations(pending)) {
      await client.mealPlan.replaceRecipe.mutate({
        ...op,
        mealType: asMealType(op.mealType),
        pinned: false,
      });
    }
    const restored = await readWeek();
    for (const swap of result.swaps) {
      expect(recipeAt(restored, swap.dayOfWeek, swap.mealType)).toBe(swap.previousRecipeId);
    }
  });

  it('a stale or unknown swap is skipped, never an error and never a write', async () => {
    const swap = must(must(preview, 'a rebalance preview').swaps[0], 'a swap');
    const stale = await client.mealPlan.applyRebalance.mutate({
      planId,
      localDate: MONDAY,
      swaps: [
        {
          dayOfWeek: swap.dayOfWeek,
          mealType: asMealType(swap.mealType),
          previousRecipeId: 'not-what-the-slot-holds',
          newRecipeId: swap.newRecipeId,
        },
        {
          dayOfWeek: swap.dayOfWeek,
          mealType: asMealType(swap.mealType),
          previousRecipeId: swap.previousRecipeId,
          newRecipeId: 'a-recipe-that-is-not-in-the-curated-pool',
        },
      ],
    });
    expect(stale.rebalanced).toBe(false);
    expect(recipeAt(await readWeek(), swap.dayOfWeek, swap.mealType)).toBe(swap.previousRecipeId);
  });
});

describe('a protein-short week on a loss goal is offered protein, not bigger portions', () => {
  beforeAll(async () => {
    // Start from a clean Monday and a plan that is low in protein everywhere.
    const day = await client.tracker.getDay.query({ date: MONDAY });
    const ids = (day.log?.loggedMeals ?? []).flatMap((m) => (m.entryId ? [m.entryId] : []));
    if (ids.length > 0) await client.tracker.deleteEntries.mutate({ date: MONDAY, entryIds: ids });
    await setFuture('breakfast', LOW_PROTEIN.breakfast);
    await setFuture('lunch', LOW_PROTEIN.lunch);
    await setFuture('dinner', LOW_PROTEIN.dinner);
    await setFuture('snack', LOW_PROTEIN.snack);
  }, 60_000);

  it('offers higher-protein swaps within 10 % of a day’s calories, plus protein snacks', async () => {
    const preview = must(
      await client.mealPlan.previewRebalance.query({ planId, localDate: MONDAY }),
      'a rebalance preview',
    );
    expect(preview.headline).toMatch(/g short on protein/);
    const protein = must(preview.week.protein, 'the week’s protein numbers');
    expect(protein.gapG).toBeGreaterThan(30);

    expect(preview.swaps.length).toBeGreaterThan(0);
    let added = 0;
    for (const swap of preview.swaps) {
      expect(['protein', 'both']).toContain(swap.reason);
      const gained =
        must(swap.newProteinG, 'newProteinG') - must(swap.previousProteinG, 'previousProteinG');
      expect(gained).toBeGreaterThanOrEqual(8);
      expect(swap.explanation).toMatch(/\(\+\d+ g protein/);
      added += must(swap.newKcal, 'newKcal') - must(swap.previousKcal, 'previousKcal');
    }
    // UX-PLAN-08: never "Bigger portions (+503 kcal)" on a weight-loss goal.
    expect(added).toBeLessThanOrEqual(0.1 * (preview.week.targetKcal / 7));
    expect(protein.gapAfterG).toBeLessThan(protein.gapG);
    // The gap is too big for two swaps: a protein snack is offered as well.
    const snack = must(preview.snacks[0], 'a protein snack');
    expect(snack.proteinG).toBeGreaterThan(0);
    expect(snack.name.length).toBeGreaterThan(0);
  });
});

describe('old clients (no rebalanceMode) keep today’s behaviour', () => {
  it('the log response has `rebalance` and no `rebalancePreview`', async () => {
    const out = await client.tracker.logCustomMeal.mutate({
      date: MONDAY,
      name: 'Tea and a biscuit',
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 80,
    });
    expect(out).toHaveProperty('rebalance');
    expect(out).not.toHaveProperty('rebalancePreview');
    if (out.rebalance?.rebalanced) {
      // If the server's own today had a week to fix, it applied it at once.
      expect(out.rebalance.planId).toBe(planId);
      const first = must(out.rebalance.swaps[0], 'a swap');
      expect(first.previousRecipeId.length).toBeGreaterThan(0);
      expect(first.newRecipeId.length).toBeGreaterThan(0);
    } else {
      expect(out.rebalance).toMatchObject({ rebalanced: false, swaps: [] });
    }
    await client.tracker.deleteEntries.mutate({ date: MONDAY, entryIds: [out.entryId] });
  });

  it('a log in preview mode never applies anything either', async () => {
    const out = await client.tracker.logCustomMeal.mutate({
      date: MONDAY,
      name: 'Another biscuit',
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 80,
      rebalanceMode: 'preview',
    });
    expect(out.rebalance).toBeNull();
    await client.tracker.deleteEntries.mutate({ date: MONDAY, entryIds: [out.entryId] });
  });
});
