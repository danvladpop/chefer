import { describe, expect, it, vi } from 'vitest';
import type { CoachingLink, DailyLog } from '@chefer/database';
import type { CoachingAccess } from './coaching-access.service.js';
import { CoachingDataService, type CoachingDataDeps } from './coaching-data.service.js';

// Lane K1: the trainer's read of a client's shared food log and weight. The
// access middleware is the gate (coaching-access.service.test.ts); this proves
// the service re-checks the switch, follows the client's numbers mode and
// returns only the allow-listed fields.

vi.mock('../../lib/env.js', () => ({ env: {} }));

const NOW = new Date('2026-10-22T12:00:00Z');
const TODAY = '2026-10-22';

const link = (over: Partial<CoachingLink> = {}): CoachingLink => ({
  id: 'link1',
  trainerId: 'trainer1',
  clientId: 'client1',
  status: 'ACTIVE',
  inviteCode: null,
  requestId: null,
  trainerLabel: null,
  startedAt: NOW,
  startedOn: null,
  endedAt: null,
  endedBy: null,
  consentCopyVersion: 2,
  shareFoodAt: NOW,
  shareWeightAt: NOW,
  ...over,
});

const access = (l: CoachingLink | null, scope: 'food' | 'weight' = 'food'): CoachingAccess => ({
  trainerId: 'trainer1',
  clientId: 'client1',
  scope,
  link: l,
});

const log = (date: string, over: Partial<DailyLog> = {}): DailyLog => ({
  id: `log-${date}`,
  userId: 'client1',
  date: new Date(`${date}T00:00:00Z`),
  loggedMeals: [
    {
      entryId: 'e1',
      recipeId: 'oats',
      mealType: 'breakfast',
      slotIndex: 0,
      portionMultiplier: 1,
      kcal: 400,
      protein: 20,
      carbs: 60,
      fat: 8,
    },
    {
      entryId: 'e2',
      custom: { name: 'Shawarma', estimatedBy: 'vision' },
      mealType: 'lunch',
      portionMultiplier: 1,
      kcal: 700,
      protein: 35,
      carbs: 70,
      fat: 30,
    },
  ],
  totalKcal: 1100,
  totalProtein: 55,
  totalCarbs: 130,
  totalFat: 38,
  skippedSlots: [],
  incomplete: false,
  updatedAt: NOW,
  ...over,
});

function setup(opts: { numbersMode?: string | null; logs?: DailyLog[] } = {}) {
  const deps: CoachingDataDeps = {
    profiles: {
      findByUserId: vi.fn(async () => ({
        numbersMode: opts.numbersMode ?? null,
        goal: 'MAINTAIN',
        weightKg: 80,
        allergies: ['peanuts'],
      })) as unknown as CoachingDataDeps['profiles']['findByUserId'],
    },
    logs: { findRange: vi.fn(async () => opts.logs ?? [log(TODAY)]) },
    plans: {
      findForWeek: vi.fn(async () => null),
      findRecipesByIds: vi.fn(async () => [{ id: 'oats', name: 'Overnight oats' }]),
    } as unknown as CoachingDataDeps['plans'],
    weights: {
      findInRange: vi.fn(async () => [
        {
          id: 'w1',
          userId: 'client1',
          weightKg: 80.4,
          source: 'MANUAL' as const,
          externalId: null,
          recordedAt: new Date('2026-10-20T07:00:00Z'),
        },
        {
          id: 'w2',
          userId: 'client1',
          weightKg: 80.1,
          source: 'MANUAL' as const,
          externalId: null,
          recordedAt: new Date('2026-10-22T07:00:00Z'),
        },
      ]),
    },
    users: {
      findById: vi.fn(async () => ({ id: 'client1', planTier: 'FREE', role: 'USER' })),
    } as unknown as CoachingDataDeps['users'],
    training: {
      loadLifter: vi.fn(async () => ({ lifterBodyweightKg: null })),
      trainingWeek: vi.fn(async () => ({ trainingDays: [], basis: null })),
    },
    content: {
      countSessions: vi.fn(async () => new Map([['client1', 2]])),
      gymProfiles: vi.fn(
        async () => new Map([['client1', { weeklyGoal: 3, goalHistory: null }]]),
      ) as unknown as CoachingDataDeps['content']['gymProfiles'],
    },
  };
  return { service: new CoachingDataService(deps), deps };
}

describe('CoachingDataService.food', () => {
  it('one row per day ending today, with names, totals, targets and nothing else', async () => {
    const { service } = setup();
    const food = await service.food(access(link()), TODAY, 7);
    expect(food.numbers).toBe('FULL');
    expect(food.days).toHaveLength(7);
    expect(food.days.at(-1)).toMatchObject({
      date: TODAY,
      mealsLogged: 2,
      kcal: 1100,
      proteinG: 55,
      plan: null,
    });
    expect(food.days.at(-1)?.entries.map((e) => e.name)).toEqual(['Overnight oats', 'Shawarma']);
    expect(food.days[0]).toMatchObject({ mealsLogged: 0, kcal: null });
    const json = JSON.stringify(food);
    expect(json).not.toMatch(/peanut|allerg|carbs|fat|estimatedBy|entryId/i);
  });

  it('follows the client numbers mode: protein only, or no numbers', async () => {
    const protein = await setup({ numbersMode: 'PROTEIN_ONLY' }).service.food(
      access(link()),
      TODAY,
      1,
    );
    expect(protein.days[0]).toMatchObject({ kcal: null, targetKcal: null, proteinG: 55 });
    const none = await setup({ numbersMode: 'NONE' }).service.food(access(link()), TODAY, 1);
    expect(none.numbers).toBe('NONE');
    expect(none.days[0]).toMatchObject({
      kcal: null,
      proteinG: null,
      targetProteinG: null,
      mealsLogged: 2,
    });
  });

  it('never reads without the switch on the link (defence in depth)', async () => {
    const { service, deps } = setup();
    await expect(service.food(access(link({ shareFoodAt: null })), TODAY, 7)).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
    await expect(service.food(access(null), TODAY, 7)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(deps.logs.findRange).not.toHaveBeenCalled();
  });

  it('caps the window at 28 days', async () => {
    const { service } = setup({ logs: [] });
    expect((await service.food(access(link()), TODAY, 400)).days).toHaveLength(28);
  });
});

describe('CoachingDataService.weight', () => {
  it('one weigh-in per day, oldest first', async () => {
    const { service } = setup();
    const weight = await service.weight(access(link(), 'weight'), TODAY);
    expect(weight.entries).toEqual([
      { date: '2026-10-20', weightKg: 80.4 },
      { date: '2026-10-22', weightKg: 80.1 },
    ]);
  });

  it('never reads without the weight switch', async () => {
    const { service, deps } = setup();
    await expect(
      service.weight(access(link({ shareWeightAt: null }), 'weight'), TODAY),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(deps.weights.findInRange).not.toHaveBeenCalled();
  });
});

describe('CoachingDataService.weekSummary (lane K2)', () => {
  it('training always; food and weight only when the link shares them', async () => {
    const { service, deps } = setup();
    const both = await service.weekSummary(access(link(), 'food'), TODAY);
    expect(both).toMatchObject({
      from: '2026-10-16',
      to: TODAY,
      workouts: { done: 2, goal: 3 },
      sharing: { food: true, weight: true },
      food: { daysLogged: 1, mealsLogged: 2, avgKcal: 1100, avgProteinG: 55 },
      weight: { latest: { date: '2026-10-22', weightKg: 80.1 }, changeKg: null },
    });

    vi.clearAllMocks();
    const none = await service.weekSummary(
      access(link({ shareFoodAt: null, shareWeightAt: null }), 'food'),
      TODAY,
    );
    expect(none).toMatchObject({
      sharing: { food: false, weight: false },
      food: null,
      weight: null,
    });
    expect(deps.logs.findRange).not.toHaveBeenCalled();
    expect(deps.weights.findInRange).not.toHaveBeenCalled();
  });
});
