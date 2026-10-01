import { expect } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail, type ContractClient } from './client';

// Shared plumbing for friends.contract.test.ts (Following, docs/friends
// implementation-plan.md §9 "Contract"). Every scenario builds its own
// throwaway users here — nothing in this file touches a seeded account.

export const CONTRACT_PASSWORD = 'Contract@123!';

export type ContractApi = ContractClient['client'];

export interface ContractUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  api: ContractApi;
}

const CONSONANTS = 'bcdfghjklmnpqrstvwxz';

/**
 * Letters only, consonants only: no digits (a name's search tokens must
 * survive normalisation) and no vowels, so a random name can never spell
 * something the word filter (PRD §9.4) rejects.
 */
export function randomLetters(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CONSONANTS.charAt(Math.floor(Math.random() * CONSONANTS.length));
  }
  return out;
}

/** A well-formed id that belongs to nobody (`z.string().cuid()`). */
export function randomCuid(): string {
  return `c${Date.now().toString(36)}${randomLetters(10)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface MakeUserOptions {
  /** Prefix for the email; a throwaway user per call (`uniqueEmail`). */
  prefix?: string;
  firstName?: string;
  lastName?: string;
  /** Turn Following on with this visibility; omit to leave the user not activated. */
  activate?: 'PUBLIC' | 'PRIVATE';
  /** Dev `user.upgradePlan` — needed for `recipe.importSave` (no AI involved). */
  premium?: boolean;
}

/** Register (mobile client, with consent) → optionally premium → optionally activate Following. */
export async function makeUser(options: MakeUserOptions = {}): Promise<ContractUser> {
  const c = makeContractClient();
  const firstName = options.firstName ?? `Fx${randomLetters(6)}`;
  const lastName = options.lastName ?? `Lx${randomLetters(6)}`;
  const email = uniqueEmail(options.prefix ?? 'friends-contract');
  const registered = await c.client.auth.register.mutate({
    email,
    password: CONTRACT_PASSWORD,
    firstName,
    ...CONTRACT_CONSENT,
  });
  if (!registered.session) {
    throw new Error('register response is missing the session credential');
  }
  c.setToken(registered.session.token);
  if (options.premium) await c.client.user.upgradePlan.mutate();
  if (options.activate) {
    await c.client.friends.activate.mutate({
      visibility: options.activate,
      firstName,
      lastName,
    });
  }
  return { id: registered.id, email, firstName, lastName, api: c.client };
}

/** Whether Following is on for a fresh user of this API (the file skips when it is not). */
export async function probeFriendsEnabled(): Promise<boolean> {
  const user = await makeUser({ prefix: 'friends-probe' });
  const { enabled } = await user.api.friends.availability.query();
  return enabled;
}

/** A recipe body for `recipe.create` / `recipe.importSave`, unique by name. */
export function recipeBody(name: string) {
  return {
    name,
    description: 'Contract-test recipe.',
    ingredients: [
      { name: 'Rice', quantity: 200, unit: 'g' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
    instructions: ['Cook the rice.', 'Stir in the oil.'],
    nutritionInfo: { calories: 420, protein: 9, carbs: 70, fat: 11, fiber: 3 },
    cuisineType: 'Italian',
    dietaryTags: [] as string[],
    prepTimeMins: 5,
    cookTimeMins: 15,
    servings: 2,
  };
}

/** `recipe.create` as the owner → the new recipe's id and name. */
export async function createManualRecipe(
  owner: ContractUser,
  label: string,
): Promise<{ id: string; name: string }> {
  const name = `Contract ${label} ${randomLetters(6)}`;
  const recipe = await owner.api.recipe.create.mutate(recipeBody(name));
  return { id: recipe.id, name };
}

// ─── Assertions shared by several scenarios ──────────────────────────────────

/** The one answer for every profile the caller may not know exists (INV-3). */
export const NOT_AVAILABLE = {
  message: 'Profile not available',
  data: { code: 'NOT_FOUND', httpStatus: 404, friendsLocked: null },
} as const;

export async function expectNotAvailable(call: Promise<unknown>): Promise<void> {
  await expect(call).rejects.toMatchObject(NOT_AVAILABLE);
}

/** FORBIDDEN + `data.friendsLocked` — the header is visible, the section is not. */
export async function expectLocked(
  call: Promise<unknown>,
  reason: 'locked' | 'not_shared' = 'locked',
): Promise<void> {
  await expect(call).rejects.toMatchObject({
    data: { code: 'FORBIDDEN', friendsLocked: reason },
  });
}

/** Paths of every object key named `key` anywhere inside `value` (deep, any nesting). */
export function findKeyPaths(value: unknown, key: string, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (value instanceof Date) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findKeyPaths(item, key, `${path}[${i}]`));
  }
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.toLowerCase() === key ? [`${path}.${k}`] : []),
    ...findKeyPaths(v, key, `${path}.${k}`),
  ]);
}

/** INV-6: no friends.* response carries an `email` key, at any depth. */
export function expectNoEmail(label: string, value: unknown): void {
  expect(findKeyPaths(value, 'email'), `${label} must not contain an email key`).toEqual([]);
}
