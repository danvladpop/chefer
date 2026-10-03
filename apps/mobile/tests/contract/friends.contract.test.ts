import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { NextWorkoutExerciseDto, WorkoutSessionDoc } from '@chefer/types';
import { startSession, workoutReducer } from '@chefer/utils';
import {
  CONTRACT_PASSWORD,
  createManualRecipe,
  expectLocked,
  expectNoEmail,
  expectNotAvailable,
  findKeyPaths,
  makeUser,
  probeFriendsEnabled,
  randomCuid,
  randomLetters,
  recipeBody,
} from './friends-helpers';

// Following (code name: friends) through the real API — docs/friends
// implementation-plan.md §9 "Contract", PRD §7.1 access matrix, §13, FD-15.
//
// Every scenario registers its own throwaway users (`makeUser`) so the file is
// safe next to the other contract files running in parallel. The only seeded
// account touched is `carol` (PUBLIC), and only by throwaway users FOLLOWING
// her. Nothing here calls an AI endpoint with a real provider: the one plan
// each add-to-week scenario needs is a free CURATED `mealPlan.generate` (no AI
// credit spent, same call `usage.contract.test.ts` makes).
//
// Skipped as a whole when `friends.availability` says Following is off, so an
// API without FEATURE_FLAGS=friends does not fail CI (the CI job sets it).

const CAROL_ID = 'cseedcarol000000000000001';
const NO_FOLLOWING_MESSAGE =
  'Following is off on this API (friends.availability → enabled: false); set FEATURE_FLAGS=friends to run the friends contract suite';

/** A prescribed strength exercise: 2 working sets of 30 kg × 8, no warm-ups. */
function strengthExercise(exerciseId: string, position: number): NextWorkoutExerciseDto {
  return {
    routineExerciseId: randomUUID(),
    exerciseId,
    position,
    sets: 2,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 90,
    supersetGroup: null,
    notes: null,
    repBucket: '8-12',
    suggestion: {
      kind: 'start',
      weightKg: 30,
      reps: [8, 8],
      sets: 2,
      reasonCode: 'START',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
    warmups: [],
    lastTime: null,
  };
}

/** A finished freestyle workout with every set ticked, dated today (the owner is UTC). */
function finishedWorkout(exercises: NextWorkoutExerciseDto[]): WorkoutSessionDoc {
  const today = new Date().toISOString().slice(0, 10);
  const startedAt = `${today}T00:05:00.000Z`;
  let doc = startSession({
    id: randomUUID(),
    newId: randomUUID,
    now: startedAt,
    localDate: today,
    routineId: null,
    routineDayId: null,
    name: 'Per-hand contract workout',
    isDeload: false,
    exercises,
  });
  let minute = 1;
  const at = () => new Date(Date.parse(startedAt) + minute++ * 60_000).toISOString();
  for (const se of doc.exercises) {
    for (const set of se.sets) {
      doc = workoutReducer(doc, { type: 'completeSet', seId: se.id, setId: set.id, at: at() });
    }
  }
  return workoutReducer(doc, { type: 'finish', at: at() });
}

const friendsEnabled = await probeFriendsEnabled();
if (!friendsEnabled) console.warn(`[friends.contract] SKIPPED: ${NO_FOLLOWING_MESSAGE}`);

/** A day-of-week/meal slot the add-to-week scenarios use on the viewer's own plan. */
const SLOT = { weekOffset: 0, dayOfWeek: 0, mealType: 'snack' as const };

/** A viewer's current-week plan without spending AI: a free curated generate. */
async function giveCurrentWeekPlan(user: Awaited<ReturnType<typeof makeUser>>) {
  const plan = await user.api.mealPlan.generate.mutate({ weekOffset: 0 });
  expect(plan.days.length).toBeGreaterThan(0);
  return plan;
}

describe.skipIf(!friendsEnabled)('friends contract (Following)', () => {
  // ─── 1. private: request → accept → visible → unfollow → locked ────────────
  describe('private profile: request, accept, unfollow', () => {
    it('opens the content on accept and locks it again on unfollow', async () => {
      const owner = await makeUser({ prefix: 'friends-private', activate: 'PRIVATE' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const recipe = await createManualRecipe(owner, 'Private');

      // Header is readable; every section is closed.
      const header = await viewer.api.friends.profile.query({ userId: owner.id });
      expect(header.user.id).toBe(owner.id);
      expect(header.visibility).toBe('PRIVATE');
      expect(header.access).toEqual({ plan: 'locked', recipes: 'locked', workouts: 'locked' });
      expect(header.recipeCount).toBeNull();
      await expectLocked(viewer.api.friends.week.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.recipes.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.routine.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.workouts.query({ userId: owner.id }));

      // A private account takes a request, not an instant follow.
      const followed = await viewer.api.friends.follow.mutate({ userId: owner.id });
      expect(followed.relation).toBe('requested');
      await expectLocked(viewer.api.friends.recipes.query({ userId: owner.id }));

      const pending = await owner.api.friends.requests.query({});
      expect(pending.items.map((i) => i.id)).toContain(viewer.id);
      await owner.api.friends.acceptRequest.mutate({ userId: viewer.id });

      // Accepted: the sections no longer answer FORBIDDEN.
      const after = await viewer.api.friends.profile.query({ userId: owner.id });
      expect(after.user.relation).toBe('following');
      expect(after.access).toEqual({ plan: 'visible', recipes: 'visible', workouts: 'visible' });
      const recipes = await viewer.api.friends.recipes.query({ userId: owner.id });
      expect(recipes.items.map((r) => r.id)).toContain(recipe.id);
      await expect(viewer.api.friends.week.query({ userId: owner.id })).resolves.toBeDefined();
      await expect(viewer.api.friends.workouts.query({ userId: owner.id })).resolves.toEqual([]);

      // Unfollow: locked again.
      const unfollowed = await viewer.api.friends.unfollow.mutate({ userId: owner.id });
      expect(unfollowed.relation).toBe('none');
      await expectLocked(viewer.api.friends.week.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.recipes.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.workouts.query({ userId: owner.id }));
    });
  });

  // ─── 2. public: instant follow; a non-follower sees the header only ─────────
  describe('public profile', () => {
    it('shows a non-follower the header only, and follows instantly', async () => {
      const owner = await makeUser({ prefix: 'friends-public', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      await createManualRecipe(owner, 'Public');

      const header = await viewer.api.friends.profile.query({ userId: owner.id });
      expect(header.visibility).toBe('PUBLIC');
      expect(header.user.relation).toBe('none');
      expect(header.access).toEqual({ plan: 'locked', recipes: 'locked', workouts: 'locked' });
      expect(header.recipeCount).toBeNull();
      await expectLocked(viewer.api.friends.week.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.recipes.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.routine.query({ userId: owner.id }));
      await expectLocked(viewer.api.friends.workouts.query({ userId: owner.id }));

      const followed = await viewer.api.friends.follow.mutate({ userId: owner.id });
      expect(followed.relation).toBe('following'); // no request step
      const recipes = await viewer.api.friends.recipes.query({ userId: owner.id });
      expect(recipes.items).toHaveLength(1);
    });

    it('lets an owner who stops sharing a section answer not_shared to a follower', async () => {
      const owner = await makeUser({ prefix: 'friends-notshared', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      await viewer.api.friends.follow.mutate({ userId: owner.id });
      await owner.api.friends.updateSettings.mutate({ shareWorkouts: false });
      await expectLocked(viewer.api.friends.workouts.query({ userId: owner.id }), 'not_shared');
      await expect(viewer.api.friends.recipes.query({ userId: owner.id })).resolves.toBeDefined();
    });
  });

  // ─── 3. name search ─────────────────────────────────────────────────────────
  describe('people search', () => {
    it('finds by first/last-name prefix, ignoring diacritics, and never by email', async () => {
      const firstTail = randomLetters(6);
      const lastTail = randomLetters(5);
      const firstName = `Zé${firstTail}`; // é
      const lastName = `Müller${lastTail}`; // ü
      const target = await makeUser({
        // The email's local part IS the first name: an email path would find it.
        prefix: `ze${firstTail}`,
        firstName,
        lastName,
        activate: 'PUBLIC',
      });
      const viewer = await makeUser({ prefix: 'friends-searcher', activate: 'PUBLIC' });

      const found = async (query: string) =>
        (await viewer.api.friends.search.query({ query })).items.map((i) => i.id);

      // First-name prefix, accent-free and lower-case.
      expect(await found(`ze${firstTail.slice(0, 4)}`)).toContain(target.id);
      // The same prefix typed WITH the accent and in capitals.
      expect(await found(`ZÉ${firstTail.slice(0, 4).toUpperCase()}`)).toContain(target.id);
      // Last-name prefix, accent-free, and with the accent.
      expect(await found(`muller${lastTail.slice(0, 3)}`)).toContain(target.id);
      expect(await found(`Müller${lastTail.slice(0, 3)}`)).toContain(target.id);
      // Full name, either order of typing.
      expect(await found(`${firstName} ${lastName}`)).toContain(target.id);

      // Email is not a search key (Q-F-5): the exact address finds nobody.
      const byEmail = await viewer.api.friends.search.query({ query: target.email });
      expect(byEmail.items).toEqual([]);
      const byLocalPart = await viewer.api.friends.search.query({
        query: target.email.split('@')[0] ?? '',
      });
      expect(byLocalPart.items.map((i) => i.id)).not.toContain(target.id);
      expectNoEmail('friends.search', byEmail);
    });

    it('does not list the searcher themself, a blocked account, or someone not on Following', async () => {
      const tail = randomLetters(7);
      const blockedUser = await makeUser({
        firstName: `Qb${tail}`,
        lastName: 'Contract',
        activate: 'PUBLIC',
      });
      const off = await makeUser({ firstName: `Qb${tail}x`, lastName: 'Contract' }); // never activated
      const viewer = await makeUser({
        firstName: `Qb${tail}v`,
        lastName: 'Contract',
        activate: 'PUBLIC',
      });
      const ids = async () =>
        (await viewer.api.friends.search.query({ query: `qb${tail}` })).items.map((i) => i.id);

      expect(await ids()).toContain(blockedUser.id);
      expect(await ids()).not.toContain(viewer.id);
      expect(await ids()).not.toContain(off.id);
      await viewer.api.friends.block.mutate({ userId: blockedUser.id });
      expect(await ids()).not.toContain(blockedUser.id);
    });
  });

  // ─── 4. not-visible ids all look identical ──────────────────────────────────
  describe('not-visible profiles (INV-3)', () => {
    it('answers NOT_FOUND "Profile not available" for random, blocked and not-activated ids alike', async () => {
      const viewer = await makeUser({ prefix: 'friends-probe-viewer', activate: 'PUBLIC' });
      const blocked = await makeUser({ prefix: 'friends-blocked', activate: 'PUBLIC' });
      const blockedBy = await makeUser({ prefix: 'friends-blockedby', activate: 'PUBLIC' });
      const notActivated = await makeUser({ prefix: 'friends-off' });
      await viewer.api.friends.block.mutate({ userId: blocked.id });
      await blockedBy.api.friends.block.mutate({ userId: viewer.id });

      for (const id of [randomCuid(), blocked.id, blockedBy.id, notActivated.id]) {
        await expectNotAvailable(viewer.api.friends.profile.query({ userId: id }));
        await expectNotAvailable(viewer.api.friends.week.query({ userId: id }));
        await expectNotAvailable(viewer.api.friends.recipes.query({ userId: id }));
        await expectNotAvailable(viewer.api.friends.routine.query({ userId: id }));
        await expectNotAvailable(viewer.api.friends.workouts.query({ userId: id }));
        await expectNotAvailable(viewer.api.friends.follow.mutate({ userId: id }));
      }
    });

    it('asks a viewer who has not turned Following on to do so (PRECONDITION_FAILED)', async () => {
      const owner = await makeUser({ activate: 'PUBLIC' });
      const viewer = await makeUser({}); // registered, never activated
      await expect(viewer.api.friends.profile.query({ userId: owner.id })).rejects.toMatchObject({
        data: { code: 'PRECONDITION_FAILED', friendsNotActivated: true },
      });
    });
  });

  // ─── 5. an imported recipe is listed with its source domain ────────────────
  describe('recipes: written and imported', () => {
    it('lists an imported recipe with sourceDomain and a written one without', async () => {
      // `recipe.create` has no sourceUrl input; the saved-import path is
      // `recipe.importSave` (premium, no AI at the save step) — both create a
      // MANUAL recipe, which is what Following lists.
      const owner = await makeUser({
        prefix: 'friends-import',
        activate: 'PUBLIC',
        premium: true,
      });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const written = await createManualRecipe(owner, 'Written');
      const importedName = `Contract Imported ${randomLetters(6)}`;
      const sourceUrl = 'https://www.example-recipes.com/pasta/carbonara-123?utm=x';
      const imported = await owner.api.recipe.importSave.mutate({
        recipe: recipeBody(importedName),
        variant: 'original',
        sourceUrl,
      });

      await viewer.api.friends.follow.mutate({ userId: owner.id });
      const page = await viewer.api.friends.recipes.query({ userId: owner.id });
      const card = page.items.find((r) => r.id === imported.id);
      expect(card).toBeDefined();
      expect(card?.name).toBe(importedName);
      expect(card?.sourceDomain).toBe('example-recipes.com'); // hostname, "www." stripped
      expect(card?.sourceUrl).toContain('example-recipes.com');
      expect(card?.byOwner).toBe(true); // both are the owner's own MANUAL recipes
      const own = page.items.find((r) => r.id === written.id);
      expect(own?.sourceDomain).toBeNull();
      expect(own?.byOwner).toBe(true);
    });
  });

  // ─── 6. heart → Saved with creator; unfollow → gone ─────────────────────────
  describe('hearting a followed user’s recipe', () => {
    it('shows it in Saved with its creator and drops it from Saved on unfollow', async () => {
      const owner = await makeUser({ prefix: 'friends-heart', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const recipe = await createManualRecipe(owner, 'Hearted');
      await viewer.api.friends.follow.mutate({ userId: owner.id });

      const hearted = await viewer.api.recipe.toggleFavourite.mutate({ recipeId: recipe.id });
      expect(hearted.isSaved).toBe(true);

      const saved = await viewer.api.recipe.list.query({ savedOnly: true });
      const row = saved.find((r) => r.id === recipe.id);
      expect(row).toBeDefined();
      expect(row?.creator).toMatchObject({ id: owner.id, firstName: owner.firstName });
      expect(row?.creator?.displayName).toBe(`${owner.firstName} ${owner.lastName}`);
      const card = (await viewer.api.friends.recipes.query({ userId: owner.id })).items.find(
        (r) => r.id === recipe.id,
      );
      expect(card?.isFavourite).toBe(true);

      await viewer.api.friends.unfollow.mutate({ userId: owner.id });
      const after = await viewer.api.recipe.list.query({ savedOnly: true });
      expect(after.map((r) => r.id)).not.toContain(recipe.id);
    });
  });

  // ─── 7. add to week: the viewer's plan holds their own copy ────────────────
  describe('friends.addRecipeToWeek / undoAddToWeek', () => {
    it('puts a viewer-owned copy (with origin) in the slot, never the original, and undo restores', async () => {
      const owner = await makeUser({ prefix: 'friends-xrecipe', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const original = await createManualRecipe(owner, 'ToCopy');
      await viewer.api.friends.follow.mutate({ userId: owner.id });
      await giveCurrentWeekPlan(viewer);

      const added = await viewer.api.friends.addRecipeToWeek.mutate({
        recipeId: original.id,
        ...SLOT,
        mode: 'add',
      });
      expect(added.addedRecipeId).not.toBe(original.id);
      expect(added.copiedFromId).toBe(original.id);

      const slotFor = async () => {
        const plan = await viewer.api.mealPlan.getForWeek.query({ weekOffset: 0 });
        const day = plan?.days.find((d) => d.dayOfWeek === SLOT.dayOfWeek);
        return {
          plan,
          meals: day?.meals.filter((m) => m.type === SLOT.mealType) ?? [],
        };
      };
      const placed = await slotFor();
      expect(placed.plan?.planId).toBe(added.planId);
      const meal = placed.meals.find((m) => m.recipe.id === added.addedRecipeId);
      expect(meal, 'the plan slot holds the viewer’s copy').toBeDefined();
      expect(placed.meals.map((m) => m.recipe.id)).not.toContain(original.id);
      // The copy is a recipe the VIEWER owns, attributed to the original's owner.
      const mine = await viewer.api.recipe.getMyRecipe.query({ recipeId: added.addedRecipeId });
      expect(mine.id).toBe(added.addedRecipeId);
      expect(mine.name).toBe(original.name);
      const detail = await viewer.api.mealPlan.getRecipe.query({
        recipeId: added.addedRecipeId,
      });
      expect(detail.origin).toEqual({ creatorFirstName: owner.firstName }); // "From {first}"

      // Adding the same recipe again reuses the one copy.
      const again = await viewer.api.friends.addRecipeToWeek.mutate({
        recipeId: original.id,
        ...SLOT,
        mode: 'add',
      });
      expect(again.addedRecipeId).toBe(added.addedRecipeId);
      await viewer.api.friends.undoAddToWeek.mutate({
        planId: again.planId,
        dayOfWeek: again.dayOfWeek,
        mealType: again.mealType,
        slotIndex: again.slotIndex,
        addedRecipeId: again.addedRecipeId,
      });

      // Undo the first add: the slot is gone again.
      await viewer.api.friends.undoAddToWeek.mutate({
        planId: added.planId,
        dayOfWeek: added.dayOfWeek,
        mealType: added.mealType,
        slotIndex: added.slotIndex,
        addedRecipeId: added.addedRecipeId,
      });
      const undone = await slotFor();
      expect(undone.meals.map((m) => m.recipe.id)).not.toContain(added.addedRecipeId);
    });

    it('refuses a recipe the viewer can no longer see (NOT_FOUND)', async () => {
      const owner = await makeUser({ prefix: 'friends-xrecipe', activate: 'PRIVATE' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const original = await createManualRecipe(owner, 'Closed');
      await giveCurrentWeekPlan(viewer);
      await expect(
        viewer.api.friends.addRecipeToWeek.mutate({
          recipeId: original.id,
          ...SLOT,
          mode: 'add',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
  });

  // ─── 8. the workouts window (PRD FD-15) ─────────────────────────────────────
  describe('friends.workouts window (seeded carol)', () => {
    it('returns the last 7 local days only, without notes or heart-rate fields', async () => {
      const viewer = await makeUser({ prefix: 'friends-workouts', activate: 'PUBLIC' });
      const header = await viewer.api.friends.profile.query({ userId: CAROL_ID });
      expect(header.visibility).toBe('PUBLIC'); // seeded carol
      const followed = await viewer.api.friends.follow.mutate({ userId: CAROL_ID });
      expect(followed.relation).toBe('following');

      const sessions = await viewer.api.friends.workouts.query({ userId: CAROL_ID });
      // Seed: 4 completed sessions in the owner's last 7 days + 3 older.
      expect(sessions.length).toBeGreaterThanOrEqual(4);
      expect(sessions.length).toBeLessThanOrEqual(7);

      // Carol has no time zone set → UTC. A day of slack each side keeps the
      // check stable across midnight.
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      for (const s of sessions) {
        expect(s.localDate >= day(-6) && s.localDate <= day(0), `${s.localDate} in window`).toBe(
          true,
        );
        expect(s.exercises.length).toBeGreaterThan(0);
      }
      // Newest first.
      const dates = sessions.map((s) => s.localDate);
      expect([...dates].sort().reverse()).toEqual(dates);

      // The DTO is an allow-list: no notes, no heart rate, no private fields.
      const forbidden = ['notes', 'note', 'heartrate', 'avghr', 'maxhr', 'hr', 'bpm', 'email'];
      const allKeys = new Set<string>();
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) {
            allKeys.add(k.toLowerCase());
            walk(v);
          }
        }
      };
      walk(sessions);
      for (const key of forbidden)
        expect(allKeys.has(key), `workouts DTO has "${key}"`).toBe(false);
      for (const key of allKeys) expect(key).not.toMatch(/heart|^hr|note/);
      expectNoEmail('friends.workouts', sessions);
    });

    // UX-GYM-19: additive optional `perHand` on a workout exercise, filled from
    // the exercise itself; omitted (not `false`) for a barbell lift.
    it('marks a dumbbell exercise perHand: true and leaves a barbell one without the flag', async () => {
      const owner = await makeUser({ prefix: 'friends-perhand', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-perhand-viewer', activate: 'PUBLIC' });
      const workout = finishedWorkout([
        strengthExercise('dumbbell-bench-press', 0),
        strengthExercise('barbell-bench-press', 1),
      ]);
      const upload = await owner.api.gym.session.upsertMany.mutate({ docs: [workout] });
      expect(upload.results[0]?.status).toBe('applied');
      await viewer.api.friends.follow.mutate({ userId: owner.id });

      const sessions = await viewer.api.friends.workouts.query({ userId: owner.id });
      const shared = sessions.find((s) => s.id === workout.id);
      expect(shared, 'the uploaded workout is in the friend window').toBeTruthy();
      const byId = (id: string) => shared?.exercises.find((e) => e.exerciseId === id);
      expect(byId('dumbbell-bench-press')?.perHand).toBe(true);
      expect(byId('barbell-bench-press')).toBeTruthy();
      expect(byId('barbell-bench-press')).not.toHaveProperty('perHand');
      expect(byId('dumbbell-bench-press')?.sets).toEqual([
        { weightKg: 30, reps: 8 },
        { weightKg: 30, reps: 8 },
      ]);
    });
  });

  // ─── 9. availability + no email anywhere ────────────────────────────────────
  describe('availability and the no-email rule (INV-6)', () => {
    it('reports Following enabled for a throwaway user', async () => {
      const user = await makeUser({ prefix: 'friends-availability' });
      await expect(user.api.friends.availability.query()).resolves.toEqual({ enabled: true });
    });

    it('carries no email key in any friends.* response', async () => {
      const owner = await makeUser({ prefix: 'friends-noemail', activate: 'PRIVATE' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const recipe = await createManualRecipe(owner, 'NoEmail');
      await viewer.api.friends.follow.mutate({ userId: owner.id });
      await owner.api.friends.acceptRequest.mutate({ userId: viewer.id });
      await giveCurrentWeekPlan(viewer);

      const responses: [string, unknown][] = [
        ['owner.me', await owner.api.friends.me.query()],
        ['owner.requests', await owner.api.friends.requests.query({})],
        ['owner.followers', await owner.api.friends.followers.query({})],
        ['owner.activity', await owner.api.friends.activity.query({})],
        ['owner.suggestions', await owner.api.friends.suggestions.query({})],
        ['viewer.me', await viewer.api.friends.me.query()],
        ['viewer.following', await viewer.api.friends.following.query({})],
        ['viewer.profile', await viewer.api.friends.profile.query({ userId: owner.id })],
        ['viewer.week', await viewer.api.friends.week.query({ userId: owner.id })],
        ['viewer.recipes', await viewer.api.friends.recipes.query({ userId: owner.id })],
        ['viewer.routine', await viewer.api.friends.routine.query({ userId: owner.id })],
        ['viewer.workouts', await viewer.api.friends.workouts.query({ userId: owner.id })],
        ['viewer.suggestions', await viewer.api.friends.suggestions.query({})],
        ['viewer.search', await viewer.api.friends.search.query({ query: owner.firstName })],
        [
          'viewer.addRecipeToWeek',
          await viewer.api.friends.addRecipeToWeek.mutate({
            recipeId: recipe.id,
            ...SLOT,
            mode: 'add',
          }),
        ],
        ['viewer.blocked', await viewer.api.friends.blocked.query({})],
      ];
      for (const [label, value] of responses) {
        expectNoEmail(`friends.${label}`, value);
      }
      expect(JSON.stringify(responses)).not.toContain(owner.email);
      expect(JSON.stringify(responses)).not.toContain(viewer.email);
    });

    it('the deep scan really looks (it finds a nested email key)', () => {
      expect(findKeyPaths({ a: [{ b: { Email: 'x@y.z' } }] }, 'email')).toEqual(['$.a[0].b.Email']);
      expect(findKeyPaths({ a: [{ b: { emailed: true } }] }, 'email')).toEqual([]);
    });
  });

  // ─── 10. report → blocked both ways ─────────────────────────────────────────
  describe('friends.report', () => {
    it('blocks both ways and does not hide the recipe (a fresh reporter is ineligible)', async (ctx) => {
      const owner = await makeUser({ prefix: 'friends-reported', activate: 'PUBLIC' });
      const reporter = await makeUser({ prefix: 'friends-reporter', activate: 'PUBLIC' });
      const recipe = await createManualRecipe(owner, 'Reported');
      await reporter.api.friends.follow.mutate({ userId: owner.id });

      type ReportCall = (input: {
        userId: string;
        recipeId?: string;
        reason: string;
      }) => Promise<unknown>;
      // L-MODERATION may not be merged yet: the router then answers "No
      // mutation-procedure" (BAD_PATH / NOT_FOUND). Skip until it is.
      const friendsApi = reporter.api.friends as unknown as { report: { mutate: ReportCall } };
      try {
        await friendsApi.report.mutate({ userId: owner.id, recipeId: recipe.id, reason: 'SPAM' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/No "mutation"-procedure|not found on router|No procedure/i.test(message)) {
          console.warn('[friends.contract] friends.report is not on this API — skipping');
          ctx.skip();
        }
        throw error;
      }

      // Blocked both ways.
      await expectNotAvailable(reporter.api.friends.profile.query({ userId: owner.id }));
      await expectNotAvailable(owner.api.friends.profile.query({ userId: reporter.id }));
      await expectNotAvailable(reporter.api.friends.recipes.query({ userId: owner.id }));
      const blocked = await reporter.api.friends.blocked.query({});
      expect(blocked.items.map((i) => i.id)).toContain(owner.id);

      // One fresh (<24 h, unverified) reporter is below MODERATION.RECIPE_HIDE_REPORTERS
      // and ineligible anyway: the recipe stays visible to its owner and unflagged.
      const mine = await owner.api.recipe.list.query({ myRecipesOnly: true });
      const row = mine.find((r) => r.id === recipe.id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('hidden');
    });
  });

  // ─── 11. the owner deletes their account ────────────────────────────────────
  describe('owner deletes their account', () => {
    it('keeps the viewer’s plan (and its copy) loading', async () => {
      const owner = await makeUser({ prefix: 'friends-deleted', activate: 'PUBLIC' });
      const viewer = await makeUser({ prefix: 'friends-viewer', activate: 'PUBLIC' });
      const original = await createManualRecipe(owner, 'Orphaned');
      await viewer.api.friends.follow.mutate({ userId: owner.id });
      await giveCurrentWeekPlan(viewer);
      const added = await viewer.api.friends.addRecipeToWeek.mutate({
        recipeId: original.id,
        ...SLOT,
        mode: 'add',
      });

      await owner.api.user.deleteSelf.mutate({ password: CONTRACT_PASSWORD, confirm: 'DELETE' });

      const plan = await viewer.api.mealPlan.getForWeek.query({ weekOffset: 0 });
      expect(plan?.planId).toBe(added.planId);
      const slot = plan?.days
        .find((d) => d.dayOfWeek === SLOT.dayOfWeek)
        ?.meals.find((m) => m.recipe.id === added.addedRecipeId);
      expect(slot, 'the copy is still in the viewer’s plan').toBeDefined();
      expect(slot?.recipe.name).toBe(original.name);
      // The copy is the viewer's own recipe and still opens.
      const copy = await viewer.api.recipe.getMyRecipe.query({ recipeId: added.addedRecipeId });
      expect(copy.id).toBe(added.addedRecipeId);

      // The owner is gone from every friends surface.
      await expectNotAvailable(viewer.api.friends.profile.query({ userId: owner.id }));
      const following = await viewer.api.friends.following.query({});
      expect(following.items.map((i) => i.id)).not.toContain(owner.id);
    });
  });
});
