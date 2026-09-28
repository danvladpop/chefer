import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-01/T-01.2 — the ONE safety filter, exercised through the real API with
// the same link stack the app ships (headers, transformer, batching). A
// throwaway user per file (client.ts: "mutate state must register their own
// throwaway user instead" — the seeded alice account is read-only here).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('safety-contract'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'Safety',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('safety.getTable — legacy free-text recognition (UX-01 b)', () => {
  it('recognises legacy strings and flags them for review until confirmed', async () => {
    await client.preferences.updateSafety.mutate({
      allergies: ['nuts'],
      dietaryRestrictions: ['no eggs'],
      dislikedIngredients: ['green vegetables'],
    });

    const table = await client.safety.getTable.query();
    expect(table.needsReview).toBe(false); // every term here IS recognised
    const you = table.people.find((p) => p.who === 'you');
    expect(you?.items.map((i) => i.label).sort()).toEqual(
      ['Tree nuts', 'Vegetarian, no eggs', 'Leafy greens'].sort(),
    );
    expect(you?.notes).toEqual([]);

    // An unrecognised term is kept as a note, not silently dropped (C5e).
    // `needsReview` only watches allergies/dietaryRestrictions server-side
    // (safety.service.ts's loadContext) — a dislikes-only kept note doesn't
    // flip it, so this uses a restriction to exercise the review flag itself.
    await client.preferences.updateSafety.mutate({
      allergies: ['nuts'],
      dietaryRestrictions: ['no eggs', 'zzz-unrecognised-term'],
      dislikedIngredients: ['green vegetables'],
    });
    const tableWithNote = await client.safety.getTable.query();
    expect(tableWithNote.needsReview).toBe(true);
    const youWithNote = tableWithNote.people.find((p) => p.who === 'you');
    expect(youWithNote?.notes).toEqual(['zzz-unrecognised-term']);

    await client.safety.confirmReview.mutate();
    const confirmed = await client.safety.getTable.query();
    expect(confirmed.needsReview).toBe(false);

    // Clean slate for the tests below — no table rules should carry over.
    await client.preferences.updateSafety.mutate({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
  });
});

describe('safety.report — hides the recipe at once (AC10)', () => {
  it('recipe.list({ forTable: true }) excludes a reported recipe right away', async () => {
    // No table rules — this test is about hiddenRecipeIds, not the matcher.
    await client.preferences.updateSafety.mutate({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const recipe = await client.recipe.create.mutate({
      name: `Contract test recipe ${Date.now()}`,
      ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
    });

    const before = await client.recipe.list.query({ forTable: true, myRecipesOnly: true });
    expect(before.some((r) => r.id === recipe.id)).toBe(true);

    await client.safety.report.mutate({
      recipeId: recipe.id,
      surface: 'recipe_detail',
      reason: 'It contains something we can’t eat',
    });

    const after = await client.recipe.list.query({ forTable: true, myRecipesOnly: true });
    expect(after.some((r) => r.id === recipe.id)).toBe(false);

    const reports = await client.safety.myReports.query();
    expect(reports.some((r) => r.recipeId === recipe.id)).toBe(true);
  });
});

describe('recipe.getSafetyChecks — the detail-surface Checked line (T-02.3)', () => {
  it('returns null with no table rules, then names a conflict once an allergy is set', async () => {
    await client.preferences.updateSafety.mutate({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const recipe = await client.recipe.create.mutate({
      name: `Peanut recipe ${Date.now()}`,
      ingredients: [{ name: 'peanut butter', quantity: 30, unit: 'g' }],
    });

    const noRules = await client.recipe.getSafetyChecks.query({ recipeId: recipe.id });
    expect(noRules.safetyChecks).toBeNull();

    await client.preferences.updateSafety.mutate({
      allergies: ['Peanuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const withConflict = await client.recipe.getSafetyChecks.query({ recipeId: recipe.id });
    expect(withConflict.safetyChecks?.conflicts).toContain('Peanuts');
    expect(withConflict.safetyChecks?.checked).toEqual([]);
  });
});

describe('Plan/Replace/Shop surfaces (wave 2, L-SAFE2, T-02.1) — the same table, everywhere', () => {
  it('mealPlan.generate/getForWeek, recipe.listHiddenCount and shoppingList.getForWeek all carry the same table', async () => {
    // A dairy allergy: the free curated pool has plenty of dairy-free meals
    // (MIN_SAFE_POOL_SIZE unaffected), so `generate` succeeds normally.
    await client.preferences.updateSafety.mutate({
      allergies: ['Dairy'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });

    // §2.2: `generate`'s own response carries `tableSafety` + per-meal
    // `safetyChecks` — free tier, curated pool (buildCuratedWeek's own DTO).
    const generated = await client.mealPlan.generate.mutate({ weekOffset: 1 });
    expect(generated.tableSafety?.hasRules).toBe(true);
    expect(generated.tableSafety?.people.find((p) => p.who === 'you')?.items).toContainEqual(
      expect.objectContaining({ label: 'Dairy', kind: 'allergy' }),
    );
    const anyMeal = generated.days.flatMap((d) => d.meals)[0];
    // Every curated recipe the free pool serves is Dairy-safe by
    // construction (the pool filter already excluded unsafe ones) — the
    // read-back should say so instead of showing nothing.
    expect(anyMeal?.recipe.safetyChecks?.checked).toContainEqual(
      expect.objectContaining({ label: 'Dairy' }),
    );
    expect(anyMeal?.recipe.safetyChecks?.conflicts ?? []).toEqual([]);

    // A later plain read (assemblePlanDto) recomputes the same thing fresh.
    const read = await client.mealPlan.getForWeek.query({ weekOffset: 1 });
    expect(read?.tableSafety?.hasRules).toBe(true);

    // recipe.listHiddenCount (T-02.5 rev 2): the Replace picker's footer.
    const hidden = await client.recipe.listHiddenCount.query({});
    expect(hidden.filteredFor).toContain('Dairy');
    expect(typeof hidden.hiddenCount).toBe('number');

    // shoppingList.getForWeek: the same table, top-level.
    const shopping = await client.shoppingList.getForWeek.query({ weekOffset: 1 });
    expect(shopping.tableSafety?.hasRules).toBe(true);

    // Clean slate for any test that runs after this one in the same file.
    await client.preferences.updateSafety.mutate({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
  }, 30_000);

  it('bug fix: recipe.discover and recipe.list({forTable:true}) return 200 with safetyChecks once a rule is set', async () => {
    // The real regression (found by the orchestrator's review): `discover`
    // maps the curated pool into a SUMMARY DTO (no ingredients/
    // instructions) before attaching `safetyChecks` — casting that summary
    // straight into `SafetyService.check` threw `ingredients.map` on
    // `undefined`, so this call 500'd for any signed-in user with a rule.
    // Exercised through the real API (not the unit-test mock) so a
    // regression here fails loudly instead of only in a browser.
    try {
      await client.preferences.updateSafety.mutate({
        allergies: ['Tree nuts'],
        dietaryRestrictions: [],
        dislikedIngredients: [],
      });

      const discovered = await client.recipe.discover.query({});
      expect(discovered.length).toBeGreaterThan(0);
      const discoveredWithChecks = discovered.filter((r) => r.safetyChecks !== undefined);
      expect(discoveredWithChecks.length).toBeGreaterThan(0);
      expect(discoveredWithChecks[0]?.safetyChecks?.checked).toContainEqual(
        expect.objectContaining({ label: 'Tree nuts' }),
      );

      const listed = await client.recipe.list.query({ forTable: true, limit: 20 });
      // Not every account has saved/plan recipes — only assert the shape
      // when there's at least one row to check (the crash this guards
      // against happened inside the per-row map, so any row exercises it).
      const listedWithChecks = listed.filter((r) => r.safetyChecks !== undefined);
      if (listed.length > 0) {
        expect(listedWithChecks.length).toBeGreaterThan(0);
      }
    } finally {
      // Restore, even if an assertion above threw.
      await client.preferences.updateSafety.mutate({
        allergies: [],
        dietaryRestrictions: [],
        dislikedIngredients: [],
      });
    }
  }, 30_000);
});
