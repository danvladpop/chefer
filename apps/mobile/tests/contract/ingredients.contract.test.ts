import { beforeAll, describe, expect, it } from 'vitest';
import {
  CONTRACT_CONSENT,
  makeContractClient,
  SEED_EMAIL,
  SEED_PASSWORD,
  uniqueEmail,
} from './client';

// UX-40 slice 2 (T-40.7/T-40.9, AC12) against the REAL API through the app's
// own link stack.
//
// The "other" account is the seeded alice — read-only here (search +
// computeNutrition, no mutation), which client.ts's own comment says is
// fine; only a test that MUTATES state needs its own throwaway user. That
// keeps this file to ONE `auth.register` call (the owner, who creates the
// private ingredient) plus one `auth.login` — `auth.register` and
// `auth.login` are separate rate-limit buckets (10/15min per IP EACH,
// apps/api/src/lib/rate-limit.ts), so this barely touches either budget
// shared with the rest of the contract suite.
//
// Never `cheferapp.help+review@gmail.com`.

const owner = makeContractClient();
const other = makeContractClient();

const customName = `contract only mine ${Date.now()}`;

beforeAll(async () => {
  const ownerUser = await owner.client.auth.register.mutate({
    email: uniqueEmail('ingredients-owner'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'IngredientsOwner',
  });
  if (!ownerUser.session) {
    throw new Error('mobile register response is missing the session credential');
  }
  owner.setToken(ownerUser.session.token);

  const otherUser = await other.client.auth.login.mutate({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
  });
  if (!otherUser.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  other.setToken(otherUser.session.token);

  // The owner creates one private custom ingredient (T-40.8's flow).
  await owner.client.ingredients.createCustom.mutate({
    name: customName,
    caloriesPer100g: 250,
    proteinPer100g: 8,
    carbsPer100g: 40,
    fatPer100g: 5,
    fiberPer100g: 0,
  });
});

describe('ingredients.search — a private ingredient is invisible to another account (AC12)', () => {
  it('the owner finds their own private ingredient', async () => {
    const results = await owner.client.ingredients.search.query({ query: customName.slice(0, 10) });
    expect(results.some((r) => r.name === customName.toLowerCase())).toBe(true);
    expect(results.find((r) => r.name === customName.toLowerCase())?.isCustom).toBe(true);
  });

  it('a different account never sees it, searching the exact same text', async () => {
    const results = await other.client.ingredients.search.query({
      query: customName.slice(0, 10),
    });
    expect(results.some((r) => r.name === customName.toLowerCase())).toBe(false);
  });
});

describe("ingredients.computeNutrition — a private ingredient only feeds its owner's recipe math (AC12)", () => {
  it("the owner's line matches, contributing real macros", async () => {
    const result = await owner.client.ingredients.computeNutrition.query({
      ingredients: [{ name: customName, quantity: 100, unit: 'g' }],
      servings: 1,
    });
    expect(result.unmatched).toEqual([]);
    expect(result.matchedCount).toBe(1);
    expect(result.perServing.calories).toBe(250);
  });

  it("the SAME ingredient name is unmatched for another account — never leaks the owner's macros", async () => {
    const result = await other.client.ingredients.computeNutrition.query({
      ingredients: [{ name: customName, quantity: 100, unit: 'g' }],
      servings: 1,
    });
    expect(result.unmatched).toEqual([customName]);
    expect(result.matchedCount).toBe(0);
    expect(result.perServing.calories).toBe(0);
  });
});
