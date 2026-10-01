import { beforeAll, describe, expect, it } from 'vitest';
import { FRIENDS_COPY } from '@chefer/types';
import {
  createManualRecipe,
  expectLocked,
  expectNotAvailable,
  makeUser,
  probeFriendsEnabled,
  randomCuid,
  randomLetters,
  type ContractUser,
} from './friends-helpers';

// Following (code name: friends) — ABUSE contract tests (F3.1 L-SECURITY,
// docs/friends/implementation-plan.md §10 "F3.1", invariants §1 INV-1…INV-6).
// Every scenario thinks like an attacker against the real API: probing ids,
// forging userIds and recipe ids, replaying another user's plan id, searching
// by email, hammering the request cap, reporting what they can't see, and
// brigading with brand-new accounts.
//
// Throwaway users only (`makeUser`); no seeded account is touched. To stay
// well inside the API's per-IP registration limit next to the other contract
// files, one ATTACKER (activated, PUBLIC), one never-activated STRANGER and one
// account that has blocked the attacker are shared by the scenarios below;
// each scenario creates only its own victims. No AI is spent: the one plan
// needed (the undo IDOR) is a free CURATED `mealPlan.generate`, as in
// friends.contract.test.ts.
//
// Scenarios marked "F3.1 fix" need the L-SECURITY API changes (block of a
// not-activated user, idempotent turn-off, reserved names); they fail on an
// API built before that merge.
//
// Skipped as a whole when `friends.availability` says Following is off.

const NO_FOLLOWING_MESSAGE =
  'Following is off on this API (friends.availability → enabled: false); set FEATURE_FLAGS=friends to run the friends abuse suite';

const friendsEnabled = await probeFriendsEnabled();
if (!friendsEnabled) console.warn(`[friends-abuse.contract] SKIPPED: ${NO_FOLLOWING_MESSAGE}`);

/** Long scenarios register several users; give them room beyond the 15 s default. */
const SLOW = 90_000;

/** A client error reduced to what a caller can observe, minus per-call noise (path, stack). */
async function observed(call: Promise<unknown>): Promise<Record<string, unknown>> {
  const error = await call.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (e: unknown) => e,
  );
  const e = error as { message?: unknown; data?: Record<string, unknown> | null };
  const { path: _path, stack: _stack, ...data } = e.data ?? {};
  return { message: e.message, data };
}

/** The same failure, field for field, for every call (no existence oracle, INV-3). */
async function expectIdentical(calls: Promise<unknown>[]): Promise<Record<string, unknown>> {
  const shapes = await Promise.all(calls.map(observed));
  const [first, ...rest] = shapes;
  for (const shape of rest) expect(shape).toEqual(first);
  return first ?? {};
}

/** A current-week plan without spending AI: a free curated generate. */
async function giveCurrentWeekPlan(user: ContractUser) {
  const plan = await user.api.mealPlan.generate.mutate({ weekOffset: 0 });
  expect(plan.days.length).toBeGreaterThan(0);
  return plan;
}

const ADD_TO_SNACK = { weekOffset: 0, dayOfWeek: 0, mealType: 'snack', mode: 'add' } as const;

describe.skipIf(!friendsEnabled)('friends abuse contract (Following, F3.1)', () => {
  /** The attacker: activated, PUBLIC. Shared; every scenario uses its own victims. */
  let attacker: ContractUser;
  /** A Chefer account that never turned Following on. */
  let stranger: ContractUser;
  /** An activated account that has blocked the attacker. */
  let blockedBy: ContractUser;

  beforeAll(async () => {
    attacker = await makeUser({ prefix: 'abuse-attacker', activate: 'PUBLIC' });
    stranger = await makeUser({ prefix: 'abuse-stranger' });
    blockedBy = await makeUser({ prefix: 'abuse-blockedby', activate: 'PUBLIC' });
    await blockedBy.api.friends.block.mutate({ userId: attacker.id });
  }, SLOW);

  // ─── 1. id probing: random, blocked, blocked-by and not activated ──────────
  describe('id probing (INV-3)', () => {
    it('answers random, blocked, blocked-by and not-activated ids with identical NOT_FOUNDs', async () => {
      const blocked = await makeUser({ prefix: 'abuse-blocked', activate: 'PUBLIC' });
      await attacker.api.friends.block.mutate({ userId: blocked.id });
      const ids = [randomCuid(), blocked.id, blockedBy.id, stranger.id];

      const probes: [string, (id: string) => Promise<unknown>][] = [
        ['profile', (id) => attacker.api.friends.profile.query({ userId: id })],
        ['week', (id) => attacker.api.friends.week.query({ userId: id })],
        ['recipes', (id) => attacker.api.friends.recipes.query({ userId: id })],
        ['routine', (id) => attacker.api.friends.routine.query({ userId: id })],
        ['workouts', (id) => attacker.api.friends.workouts.query({ userId: id })],
        ['follow', (id) => attacker.api.friends.follow.mutate({ userId: id })],
        ['report', (id) => attacker.api.friends.report.mutate({ userId: id, reason: 'SPAM' })],
      ];
      for (const [name, probe] of probes) {
        const shape = await expectIdentical(ids.map(probe));
        expect(shape, name).toMatchObject({
          message: FRIENDS_COPY.notAvailable.title,
          data: { code: 'NOT_FOUND', httpStatus: 404, friendsLocked: null },
        });
      }
    });

    it('F3.1 fix: blocking someone who never turned Following on writes nothing (no name in Blocked people)', async () => {
      const before = (await attacker.api.friends.me.query()).counts.blocked;
      const random = randomCuid();
      // The same `ok` for a stranger and a random id — and nothing stored.
      for (const userId of [stranger.id, random]) {
        await expect(attacker.api.friends.block.mutate({ userId })).resolves.toEqual({ ok: true });
      }
      const list = await attacker.api.friends.blocked.query({ limit: 50 });
      const ids = list.items.map((i) => i.id);
      expect(ids).not.toContain(stranger.id);
      expect(ids).not.toContain(random);
      expect((await attacker.api.friends.me.query()).counts.blocked).toBe(before);
    });
  });

  // ─── 2. search with an email string ─────────────────────────────────────────
  describe('search by email (INV-6)', () => {
    it('never matches an email, its local part, or its domain', async () => {
      const local = `mail${randomLetters(8)}`;
      const target = await makeUser({
        // The email's local part shares nothing with the name.
        prefix: local,
        firstName: `Qz${randomLetters(6)}`,
        lastName: `Wx${randomLetters(6)}`,
        activate: 'PUBLIC',
      });

      for (const query of [target.email, target.email.split('@')[0] ?? local, local]) {
        const page = await attacker.api.friends.search.query({ query });
        expect(
          page.items.map((i) => i.id),
          query,
        ).not.toContain(target.id);
      }
      // The name still finds them: the search works, it just has no email path.
      const byName = await attacker.api.friends.search.query({ query: target.firstName });
      expect(byName.items.map((i) => i.id)).toContain(target.id);
    });
  });

  // ─── 3. the request cap ────────────────────────────────────────────────────
  describe('follow-request cap (PRD §6.2)', () => {
    it('allows 3 requests per target per 7 days, then TOO_MANY_REQUESTS; other targets unaffected', async () => {
      const owner = await makeUser({ prefix: 'abuse-capped', activate: 'PRIVATE' });
      const other = await makeUser({ prefix: 'abuse-other', activate: 'PRIVATE' });

      for (let i = 0; i < 3; i += 1) {
        await expect(attacker.api.friends.follow.mutate({ userId: owner.id })).resolves.toEqual({
          relation: 'requested',
        });
        await attacker.api.friends.unfollow.mutate({ userId: owner.id }); // cancel
      }
      await expect(attacker.api.friends.follow.mutate({ userId: owner.id })).rejects.toMatchObject({
        message: FRIENDS_COPY.server.requestCap,
        data: { code: 'TOO_MANY_REQUESTS' },
      });
      // The owner holds no request from the attacker now.
      const requests = await owner.api.friends.requests.query({});
      expect(requests.items.map((i) => i.id)).not.toContain(attacker.id);
      await expect(attacker.api.friends.follow.mutate({ userId: other.id })).resolves.toEqual({
        relation: 'requested',
      });
    });
  });

  // ─── 4. forged userId on locked scopes ──────────────────────────────────────
  describe('forged userId on locked scopes (INV-1)', () => {
    it('keeps every section FORBIDDEN for a non-follower and a pending requester, cursor or not', async () => {
      const owner = await makeUser({ prefix: 'abuse-locked', activate: 'PRIVATE' });
      await createManualRecipe(owner, 'Locked');

      const forged = { userId: owner.id };
      const sections = () => [
        attacker.api.friends.week.query(forged),
        attacker.api.friends.recipes.query(forged),
        // A crafted cursor and a wildcard search must not open anything either.
        attacker.api.friends.recipes.query({ ...forged, cursor: 'eyJpZCI6IngifQ', search: '%' }),
        attacker.api.friends.routine.query(forged),
        attacker.api.friends.workouts.query(forged),
      ];
      for (const call of sections()) await expectLocked(call);

      // A pending request is not a follow.
      await expect(attacker.api.friends.follow.mutate(forged)).resolves.toEqual({
        relation: 'requested',
      });
      for (const call of sections()) await expectLocked(call);
      const header = await attacker.api.friends.profile.query(forged);
      expect(header.recipeCount).toBeNull();
    });

    it('a tampered cursor never widens a visible recipe list beyond the owner’s shared originals', async () => {
      const owner = await makeUser({ prefix: 'abuse-cursor-owner', activate: 'PUBLIC' });
      const other = await makeUser({ prefix: 'abuse-cursor-other', activate: 'PUBLIC' });
      const mine = await createManualRecipe(owner, 'Mine');
      const notMine = await createManualRecipe(other, 'NotMine');
      await attacker.api.friends.follow.mutate({ userId: owner.id });

      for (const cursor of ['garbage', 'o999', Buffer.from(notMine.id).toString('base64url')]) {
        const page = await attacker.api.friends.recipes.query({ userId: owner.id, cursor });
        const ids = page.items.map((r) => r.id);
        expect(ids, cursor).not.toContain(notMine.id);
        for (const id of ids) expect([mine.id]).toContain(id);
      }
    });
  });

  // ─── 5. another user's recipe by id ─────────────────────────────────────────
  describe('a locked recipe by id (INV-1, INV-3)', () => {
    it('heart, rate, getRecipe, safety checks and add-to-week answer exactly like a random id', async () => {
      const owner = await makeUser({ prefix: 'abuse-recipe-owner', activate: 'PUBLIC' });
      const locked = await createManualRecipe(owner, 'NotFollowed');
      const random = randomCuid();

      const probes: [string, (id: string) => Promise<unknown>][] = [
        ['getRecipe', (id) => attacker.api.mealPlan.getRecipe.query({ recipeId: id })],
        ['toggleFavourite', (id) => attacker.api.recipe.toggleFavourite.mutate({ recipeId: id })],
        ['rate', (id) => attacker.api.recipe.rate.mutate({ recipeId: id, rating: 1 })],
        ['getSafetyChecks', (id) => attacker.api.recipe.getSafetyChecks.query({ recipeId: id })],
        [
          'addRecipeToWeek',
          (id) => attacker.api.friends.addRecipeToWeek.mutate({ recipeId: id, ...ADD_TO_SNACK }),
        ],
      ];
      for (const [name, probe] of probes) {
        const shape = await expectIdentical([probe(locked.id), probe(random)]);
        expect(shape, name).toMatchObject({
          message: 'Recipe not found.',
          data: { code: 'NOT_FOUND' },
        });
      }
      // Nothing was written: no heart slipped in.
      const saved = await attacker.api.recipe.list.query({ savedOnly: true });
      expect(saved.map((r) => r.id)).not.toContain(locked.id);
    });

    it('a recipe opened while following closes again on unfollow (heart and add refused)', async () => {
      const owner = await makeUser({ prefix: 'abuse-unfollowed', activate: 'PUBLIC' });
      const recipe = await createManualRecipe(owner, 'Revoked');
      await attacker.api.friends.follow.mutate({ userId: owner.id });
      await expect(
        attacker.api.mealPlan.getRecipe.query({ recipeId: recipe.id }),
      ).resolves.toMatchObject({ id: recipe.id });
      await attacker.api.friends.unfollow.mutate({ userId: owner.id });

      await expect(
        attacker.api.mealPlan.getRecipe.query({ recipeId: recipe.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      await expect(
        attacker.api.recipe.toggleFavourite.mutate({ recipeId: recipe.id }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
      await expect(
        attacker.api.friends.addRecipeToWeek.mutate({ recipeId: recipe.id, ...ADD_TO_SNACK }),
      ).rejects.toMatchObject({ message: 'Recipe not found.', data: { code: 'NOT_FOUND' } });
    });
  });

  // ─── 6. undoAddToWeek against another user's plan (IDOR) ────────────────────
  describe('undoAddToWeek IDOR', () => {
    it(
      'refuses another user’s plan id and leaves that plan untouched',
      async () => {
        const victim = await makeUser({ prefix: 'abuse-victim', activate: 'PUBLIC' });
        const plan = await giveCurrentWeekPlan(victim);
        const day = plan.days.find((d) => d.meals.length > 0);
        const slot = day?.meals[0];
        if (!day || !slot) throw new Error('the victim’s plan has no meal to target');
        const before = await victim.api.mealPlan.getForWeek.query({ weekOffset: 0 });

        // Remove ("add" undo) and restore ("replace" undo) variants, both forged.
        const forged = {
          planId: plan.planId,
          dayOfWeek: day.dayOfWeek,
          mealType: slot.type,
          slotIndex: 0,
          addedRecipeId: slot.recipe.id,
        };
        for (const attempt of [
          attacker.api.friends.undoAddToWeek.mutate(forged),
          attacker.api.friends.undoAddToWeek.mutate({
            ...forged,
            previousRecipeId: slot.recipe.id,
          }),
        ]) {
          await expect(attempt).rejects.toMatchObject({
            message: 'Meal plan not found.',
            data: { code: 'NOT_FOUND' },
          });
        }
        const after = await victim.api.mealPlan.getForWeek.query({ weekOffset: 0 });
        const meals = (w: typeof before) =>
          w?.days.map((d) => d.meals.map((m) => `${m.type}:${m.recipe.id}`));
        expect(meals(after)).toEqual(meals(before));
      },
      SLOW,
    );
  });

  // ─── 7. reporting what you can't see ────────────────────────────────────────
  describe('friends.report against a non-visible target', () => {
    it('refuses with NOT_FOUND and blocks nobody; a recipe id that isn’t theirs is refused too', async () => {
      const target = await makeUser({ prefix: 'abuse-target', activate: 'PUBLIC' });
      const someoneElse = await makeUser({ prefix: 'abuse-else', activate: 'PUBLIC' });
      const othersRecipe = await createManualRecipe(someoneElse, 'NotTheTargets');
      const blockedBefore = (await attacker.api.friends.me.query()).counts.blocked;

      for (const userId of [stranger.id, blockedBy.id, randomCuid()]) {
        await expectNotAvailable(attacker.api.friends.report.mutate({ userId, reason: 'SPAM' }));
      }
      // A visible target, but the recipe id belongs to someone else.
      await expect(
        attacker.api.friends.report.mutate({
          userId: target.id,
          recipeId: othersRecipe.id,
          reason: 'INAPPROPRIATE',
        }),
      ).rejects.toMatchObject({
        message: FRIENDS_COPY.server.recipeNotAvailable,
        data: { code: 'NOT_FOUND' },
      });
      // Nothing was filed: no new block, and the target is still visible.
      expect((await attacker.api.friends.me.query()).counts.blocked).toBe(blockedBefore);
      await expect(
        attacker.api.friends.profile.query({ userId: target.id }),
      ).resolves.toMatchObject({ user: { id: target.id } });
    });

    it('refuses a self-report', async () => {
      await expect(
        attacker.api.friends.report.mutate({ userId: attacker.id, reason: 'SPAM' }),
      ).rejects.toMatchObject({
        message: FRIENDS_COPY.server.reportSelf,
        data: { code: 'BAD_REQUEST' },
      });
    });
  });

  // ─── 8. brigading by brand-new accounts + the threshold race ────────────────
  describe('brigading by new accounts (PRD §9.3)', () => {
    it(
      '5 fresh reporters at once: every report blocks, none counts — no hide, no forced private',
      async () => {
        const target = await makeUser({ prefix: 'abuse-brigaded', activate: 'PUBLIC' });
        const recipe = await createManualRecipe(target, 'Brigaded');
        const reporters: ContractUser[] = [];
        for (let i = 0; i < 5; i += 1) {
          const r = await makeUser({ prefix: `abuse-brigade${i}`, activate: 'PUBLIC' });
          await r.api.friends.follow.mutate({ userId: target.id });
          reporters.push(r);
        }

        // All at once: the SERIALIZABLE report transaction must neither fail
        // nor double-act under the race (plan §4.6 step 3.5).
        const results = await Promise.all(
          reporters.map((r) =>
            r.api.friends.report.mutate({
              userId: target.id,
              recipeId: recipe.id,
              reason: 'INAPPROPRIATE',
            }),
          ),
        );
        expect(results).toEqual(reporters.map(() => ({ ok: true })));

        // Every reporter is blocked both ways.
        for (const r of reporters) {
          await expectNotAvailable(r.api.friends.profile.query({ userId: target.id }));
          await expectNotAvailable(target.api.friends.profile.query({ userId: r.id }));
        }

        // Fresh (< 24 h, unverified) reporters are ineligible: nothing was enforced.
        const me = await target.api.friends.me.query();
        expect(me.settings).toMatchObject({ visibility: 'PUBLIC', forcedPrivate: false });
        const own = await target.api.mealPlan.getRecipe.query({ recipeId: recipe.id });
        expect(own).not.toHaveProperty('hidden');

        // Anyone else still finds them, follows instantly and sees the recipe.
        const found = await attacker.api.friends.search.query({ query: target.firstName });
        expect(found.items.map((i) => i.id)).toContain(target.id);
        await expect(attacker.api.friends.follow.mutate({ userId: target.id })).resolves.toEqual({
          relation: 'following',
        });
        const recipes = await attacker.api.friends.recipes.query({ userId: target.id });
        const card = recipes.items.find((r) => r.id === recipe.id);
        expect(card).toMatchObject({ hidden: false, name: recipe.name });
      },
      SLOW,
    );

    it('a reporter can’t report the same person twice (the block makes them not visible)', async () => {
      const target = await makeUser({ prefix: 'abuse-twice', activate: 'PUBLIC' });
      await attacker.api.friends.report.mutate({ userId: target.id, reason: 'SPAM' });
      await expectNotAvailable(
        attacker.api.friends.report.mutate({ userId: target.id, reason: 'SPAM' }),
      );
    });
  });

  // ─── 9. account-level abuse ─────────────────────────────────────────────────
  describe('account-level', () => {
    it('F3.1 fix: a name passing itself off as Chefer is refused at turn-on', async () => {
      const impostor = await makeUser({ prefix: 'abuse-impostor' });
      // Random tails: on an API without the fix the profile WOULD be created,
      // and must not leave a "Chefer Kitchen" lookalike behind.
      for (const names of [
        { firstName: `Chefer_${randomLetters(5)}`, lastName: 'Kitchen' },
        { firstName: randomLetters(5), lastName: `CheferSupport${randomLetters(4)}` },
      ]) {
        const outcome = await observed(
          impostor.api.friends.activate.mutate({ visibility: 'PRIVATE', ...names }),
        ).catch(async (error: unknown) => {
          // Accepted (no fix yet): turn it off again before failing.
          await impostor.api.friends.deactivate.mutate({ confirm: 'TURN_OFF' });
          throw error;
        });
        expect(outcome).toMatchObject({
          message: FRIENDS_COPY.intro.nameRejected,
          data: { code: 'BAD_REQUEST', textRejected: 'name' },
        });
      }
      const me = await impostor.api.friends.me.query();
      expect(me.activated).toBe(false);
    });

    it('F3.1 fix: turning Following off twice answers ok both times', async () => {
      const user = await makeUser({ prefix: 'abuse-twice-off', activate: 'PUBLIC' });
      for (let i = 0; i < 2; i += 1) {
        await expect(user.api.friends.deactivate.mutate({ confirm: 'TURN_OFF' })).resolves.toEqual({
          ok: true,
        });
      }
    });

    it('a turned-off account is NOT_FOUND to a former follower, like any random id', async () => {
      const owner = await makeUser({ prefix: 'abuse-gone', activate: 'PUBLIC' });
      await attacker.api.friends.follow.mutate({ userId: owner.id });
      await owner.api.friends.deactivate.mutate({ confirm: 'TURN_OFF' });
      await expectIdentical([
        attacker.api.friends.profile.query({ userId: owner.id }),
        attacker.api.friends.profile.query({ userId: randomCuid() }),
      ]);
      const following = await attacker.api.friends.following.query({ limit: 50 });
      expect(following.items.map((i) => i.id)).not.toContain(owner.id);
    });
  });
});
