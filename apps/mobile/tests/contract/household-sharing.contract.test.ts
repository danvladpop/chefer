import { TRPCClientError } from '@trpc/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail, type ContractClient } from './client';

// ADR 0003 — a partner with their own account joins the owner's household.
// What a partner may and may NOT read is the point of this file: the shared
// week and list, never the owner's logs, weight or targets. Every scenario
// registers throwaway users; skipped when the `householdSharing` flag is off.

type Api = ContractClient['client'];
type Person = { id: string; api: Api; firstName: string };

const PASSWORD = 'Contract@123!';
const TODAY = new Date().toISOString().slice(0, 10);

async function person(prefix: string, firstName: string): Promise<Person> {
  const c = makeContractClient();
  const registered = await c.client.auth.register.mutate({
    email: uniqueEmail(prefix),
    password: PASSWORD,
    firstName,
    ...CONTRACT_CONSENT,
  });
  if (!registered.session) throw new Error('register response is missing the session credential');
  c.setToken(registered.session.token);
  return { id: registered.id, api: c.client, firstName };
}

async function setup(api: Api, weightKg: number, sex: 'MALE' | 'FEMALE') {
  // The full goal setup is premium; the partner switches back to Free below.
  await api.user.upgradePlan.mutate();
  await api.preferences.setup.mutate({
    goal: 'LOSE_WEIGHT',
    biologicalSex: sex,
    age: 34,
    heightCm: sex === 'MALE' ? 185 : 160,
    weightKg,
    activityLevel: sex === 'MALE' ? 'VERY_ACTIVE' : 'SEDENTARY',
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    mealsPerDay: 3,
  });
}

function codeOf(err: unknown): string | undefined {
  return err instanceof TRPCClientError
    ? (err as TRPCClientError<AppRouter>).data?.code
    : undefined;
}

let enabled = false;
let owner: Person;
let partner: Person;
let memberId: string;
let ownerPlanId: string;

beforeAll(async () => {
  owner = await person('hh-owner', 'Dan');
  enabled = (await owner.api.household.sharing.query()).enabled;
  if (!enabled) {
    console.warn('[household-sharing.contract] householdSharing is off on this API — skipped');
    return;
  }
  partner = await person('hh-partner', 'Maria');
  await setup(owner.api, 95, 'MALE');
  await setup(partner.api, 58, 'FEMALE');
  await partner.api.user.downgradePlan.mutate();
  const maria = await owner.api.household.add.mutate({
    name: 'Maria',
    portionFactor: 0.75,
    isKid: false,
    allergies: ['Peanuts'],
  });
  memberId = maria.id;
  const plan = await owner.api.mealPlan.generate.mutate({ weekOffset: 0 });
  ownerPlanId = plan.planId;
  // Private data that must never reach the partner.
  await owner.api.tracker.logWeight.mutate({ weightKg: 95.4 });
  await owner.api.tracker.logCustomMeal.mutate({
    date: TODAY,
    name: 'Owner secret snack',
    estimatedBy: 'manual',
    mealType: 'snack',
    kcal: 777,
  });
}, 60_000);

describe('invite → join (ADR 0003)', () => {
  it('a partner previews the profile, confirms its allergies and joins', async () => {
    if (!enabled) return;
    const invite = await owner.api.household.invites.create.mutate({ memberId });
    expect(invite.url).toContain(`/household/join/${invite.code}`);

    const preview = await partner.api.household.previewInvite.query({ code: invite.code });
    expect(preview).toMatchObject({
      state: 'OK',
      ownerName: 'Dan',
      profile: { name: 'Maria', allergies: ['Peanuts'] },
    });
    // The owner opening their own link learns nothing new.
    expect((await owner.api.household.previewInvite.query({ code: invite.code })).state).toBe(
      'SELF',
    );

    const joined = await partner.api.household.join.mutate({
      code: invite.code,
      allergies: ['Peanuts', 'Sesame'],
    });
    expect(joined).toEqual({ ownerName: 'Dan', profileName: 'Maria' });

    // Single use.
    const again = await person('hh-late', 'Late');
    expect((await again.api.household.previewInvite.query({ code: invite.code })).state).toBe(
      'USED',
    );

    const partnerStatus = await partner.api.household.sharing.query();
    expect(partnerStatus).toMatchObject({
      role: 'PARTNER',
      owner: { name: 'Dan' },
      myProfile: { memberId, portionFactor: 0.75 },
    });
    const ownerStatus = await owner.api.household.sharing.query();
    expect(ownerStatus.role).toBe('OWNER');
    expect(ownerStatus.partners.map((p) => p.name)).toEqual(['Maria']);

    // The confirmed terms reached the profile AND the partner's own preferences.
    const members = await owner.api.household.list.query();
    const claimed = members.find((m) => m.id === memberId);
    expect(claimed).toMatchObject({ hasAccount: true, isYou: false });
    expect(claimed?.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
    const own = await partner.api.preferences.get.query();
    expect(own.dietaryPreferences?.allergies).toEqual(
      expect.arrayContaining(['Peanuts', 'Sesame']),
    );

    const notices = await owner.api.household.notices.query();
    expect(notices[0]).toMatchObject({ kind: 'HOUSEHOLD_PARTNER_JOINED', name: 'Maria' });
  }, 60_000);
});

describe('the shared week', () => {
  it('both see the same plan; the partner sees it at their own portion and targets', async () => {
    if (!enabled) return;
    const mine = await owner.api.mealPlan.getForWeek.query({ weekOffset: 0 });
    const theirs = await partner.api.mealPlan.getForWeek.query({ weekOffset: 0 });
    expect(theirs?.planId).toBe(ownerPlanId);
    expect(mine?.planId).toBe(ownerPlanId);
    expect(theirs?.days.map((d) => d.meals.map((m) => m.recipe.id))).toEqual(
      mine?.days.map((d) => d.meals.map((m) => m.recipe.id)),
    );
    // Every slot at the partner's portion (0.75), never the owner's.
    for (const day of theirs?.days ?? []) {
      for (const meal of day.meals) expect(meal.portion).toBe(0.75);
    }
    // Targets: the partner's own, not the owner's.
    const partnerDay = await partner.api.tracker.getDay.query({ date: TODAY });
    const ownerDay = await owner.api.tracker.getDay.query({ date: TODAY });
    expect(ownerDay.targets.dailyCalorieTarget).not.toBe(partnerDay.targets.dailyCalorieTarget);
    expect(theirs?.calorieTarget).toBe(partnerDay.targets.dailyCalorieTarget);
    expect(theirs?.portionRefit).toBeUndefined();
  });

  it('a partner swaps and pins a meal; the owner sees it', async () => {
    if (!enabled) return;
    const theirs = await partner.api.mealPlan.getForWeek.query({ weekOffset: 0 });
    const day = theirs?.days.find((d) => d.meals.length > 0);
    if (!theirs || !day) throw new Error('the shared week has no meals');
    const slot = day.meals[0];
    if (!slot) throw new Error('no slot');
    await partner.api.mealPlan.setSlotPinned.mutate({
      planId: theirs.planId,
      dayOfWeek: day.dayOfWeek,
      mealType: slot.type,
      slotIndex: 0,
      pinned: true,
      expectedRecipeId: slot.recipe.id,
    });
    // The owner is premium, so the swap is an AI swap: it is the partner's action and
    // needs the PARTNER's AI-data consent (ADR 0003), not just the owner's.
    const noConsent = await partner.api.mealPlan.swapRecipe
      .mutate({
        planId: theirs.planId,
        dayOfWeek: day.dayOfWeek,
        mealType: slot.type,
        slotIndex: 0,
      })
      .catch((e: unknown) => e);
    expect((noConsent as TRPCClientError<AppRouter>).data?.reason).toBe('AI_CONSENT_REQUIRED');
    await partner.api.user.grantAiDataConsent.mutate();
    const swapped = await partner.api.mealPlan.swapRecipe.mutate({
      planId: theirs.planId,
      dayOfWeek: day.dayOfWeek,
      mealType: slot.type,
      slotIndex: 0,
      expectedRecipeId: slot.recipe.id,
    });
    const mine = await owner.api.mealPlan.getForWeek.query({ weekOffset: 0 });
    const ownerSlot = mine?.days.find((d) => d.dayOfWeek === day.dayOfWeek)?.meals[0];
    expect(ownerSlot?.recipe.id).toBe(swapped.id);

    // The owner's stale tap on the old recipe is a CONFLICT carrying what is there now.
    const stale = await owner.api.mealPlan.setSlotPinned
      .mutate({
        planId: theirs.planId,
        dayOfWeek: day.dayOfWeek,
        mealType: slot.type,
        slotIndex: 0,
        pinned: true,
        expectedRecipeId: slot.recipe.id,
      })
      .catch((e: unknown) => e);
    expect(codeOf(stale)).toBe('CONFLICT');
    expect((stale as TRPCClientError<AppRouter>).data?.conflict).toEqual({
      kind: 'mealSlot',
      current: { dayOfWeek: day.dayOfWeek, mealType: slot.type, recipeId: swapped.id },
    });
  }, 60_000);

  it('generating the week stays with the owner', async () => {
    if (!enabled) return;
    const err = await partner.api.mealPlan.generate
      .mutate({ weekOffset: 0 })
      .catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
    expect((err as Error).message).toContain('Dan');
    const add = await partner.api.household.add
      .mutate({ name: 'Someone', isKid: false })
      .catch((e: unknown) => e);
    expect(codeOf(add)).toBe('FORBIDDEN');
  });
});

describe('privacy: a partner never reads the owner’s logs, weight or targets', () => {
  it('logs and weight stay per account', async () => {
    if (!enabled) return;
    const partnerDay = await partner.api.tracker.getDay.query({ date: TODAY });
    expect(JSON.stringify(partnerDay.log)).not.toContain('Owner secret snack');
    expect(partnerDay.log?.totalKcal ?? 0).not.toBe(777);
    expect(JSON.stringify(partnerDay)).not.toContain('Owner secret snack');
    const weights = await partner.api.tracker.weightHistory.query({ days: 30 });
    expect(weights.map((w) => w.weightKg)).not.toContain(95.4);
    const summary = await partner.api.tracker.weeklySummary.query();
    expect(JSON.stringify(summary)).not.toContain('777');
  });

  it('no shared response carries the owner’s targets or private numbers', async () => {
    if (!enabled) return;
    const ownerDay = await owner.api.tracker.getDay.query({ date: TODAY });
    const ownerKcal = String(ownerDay.targets.dailyCalorieTarget);
    const responses = await Promise.all([
      partner.api.mealPlan.getForWeek.query({ weekOffset: 0 }),
      partner.api.shoppingList.getForWeek.query({ weekOffset: 0 }),
      partner.api.shoppingList.sync.query({ weekOffset: 0 }),
      partner.api.household.list.query(),
      partner.api.household.sharing.query(),
    ]);
    for (const r of responses) {
      const json = JSON.stringify(r);
      expect(json).not.toContain(`"calorieTarget":${ownerKcal}`);
      expect(json).not.toContain('95.4');
      expect(json).not.toContain('Owner secret snack');
      expect(json).not.toContain(owner.id);
    }
  });
});

describe('the live shared list', () => {
  it('a tick shows for the other person with who made it, and offline replays reconcile by time', async () => {
    if (!enabled) return;
    const list = await owner.api.shoppingList.getForWeek.query({ weekOffset: 0 });
    const key = list.items[0]?.key;
    if (!list.planId || !key) throw new Error('the shared list is empty');

    await owner.api.shoppingList.toggleItems.mutate({
      planId: list.planId,
      keys: [key],
      checked: true,
    });
    const seen = await partner.api.shoppingList.sync.query({ weekOffset: 0 });
    expect(seen.checkedKeys).toContain(key);
    expect(seen.checkedBy[key]).toEqual({ name: 'Dan', isYou: false });
    const partnerList = await partner.api.shoppingList.getForWeek.query({ weekOffset: 0 });
    expect(partnerList.items.find((i) => i.key === key)?.checkedBy).toEqual({
      name: 'Dan',
      isYou: false,
    });

    // The partner unticks now; the owner's OLDER offline tick arrives later and loses.
    await partner.api.shoppingList.toggleItems.mutate({
      planId: list.planId,
      keys: [key],
      checked: false,
      at: new Date().toISOString(),
    });
    await owner.api.shoppingList.toggleItems.mutate({
      planId: list.planId,
      keys: [key],
      checked: true,
      at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect((await owner.api.shoppingList.sync.query({ weekOffset: 0 })).checkedKeys).not.toContain(
      key,
    );

    // A custom item says who added it; the revision moves so clients refetch.
    const before = (await owner.api.shoppingList.sync.query({ weekOffset: 0 })).revision;
    await partner.api.shoppingList.addCustomItems.mutate({
      planId: list.planId,
      items: [{ name: 'Oat milk' }],
    });
    const after = await owner.api.shoppingList.sync.query({ weekOffset: 0 });
    expect(after.revision).not.toBe(before);
    const ownerList = await owner.api.shoppingList.getForWeek.query({ weekOffset: 0 });
    expect(ownerList.items.find((i) => i.ingredientName === 'Oat milk')?.addedBy).toEqual({
      name: 'Maria',
      isYou: false,
    });
  }, 60_000);
});

describe('leaving', () => {
  it('the partner leaves: their own plans are back, the profile and its allergies stay', async () => {
    if (!enabled) return;
    await partner.api.household.leave.mutate();
    const theirs = await partner.api.mealPlan.getForWeek.query({ weekOffset: 0 });
    expect(theirs?.planId ?? null).not.toBe(ownerPlanId);
    const members = await owner.api.household.list.query();
    const profile = members.find((m) => m.id === memberId);
    expect(profile).toMatchObject({ hasAccount: false });
    expect(profile?.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
    const notices = await owner.api.household.notices.query();
    expect(notices.map((n) => n.kind)).toContain('HOUSEHOLD_PARTNER_LEFT');
    expect((await owner.api.household.sharing.query()).role).toBe('SOLO');
  });
});
