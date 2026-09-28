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
