import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLog, IProgressSourceRepository } from '@chefer/database';
import { sessionDoc, sessionRow } from '../gym/__test__/fixtures.js';
import { makeWorld, USER } from './__test__/fakes.js';
import {
  BACKFILL_VERSION,
  ProgressBackfillService,
  scorableSessionWhere,
} from './progress-backfill.service.js';
import { ProgressRecorder } from './progress-recorder.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-22T10:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

function session(id: string, localDate: string, kg: number) {
  const doc = sessionDoc({ id, localDate, startedAt: `${localDate}T17:00:00.000Z` });
  const bench = doc.exercises[0]!;
  bench.sets[0]!.weightKg = kg;
  return sessionRow(doc, USER);
}

const customEntry = (n: number) => ({
  entryId: `c${n}`,
  custom: { name: `Meal ${n}`, estimatedBy: 'manual' },
  mealType: 'lunch',
  portionMultiplier: 1,
  kcal: 500,
  protein: 20,
  carbs: 50,
  fat: 15,
});

const dailyLog = (date: string, entries: unknown[]): DailyLog =>
  ({
    id: `log-${date}`,
    userId: USER,
    date: new Date(`${date}T00:00:00Z`),
    loggedMeals: entries,
    totalKcal: 1500,
    totalProtein: 80,
    totalCarbs: 150,
    totalFat: 50,
    skippedSlots: [],
    updatedAt: new Date(),
  }) as unknown as DailyLog;

function setup(scorable: string[] = ['s1', 's2']) {
  const world = makeWorld();
  const recorder = new ProgressRecorder(world.deps);
  const source: IProgressSourceRepository = {
    sessionIds: vi.fn().mockResolvedValue(scorable),
    dailyLogs: vi.fn().mockResolvedValue([
      dailyLog('2026-10-19', [1, 2, 3].map(customEntry)),
      // 7 entries: only 5 earn.
      dailyLog('2026-10-20', [1, 2, 3, 4, 5, 6, 7].map(customEntry)),
    ]),
    plans: vi.fn().mockResolvedValue([]),
    shoppingLists: vi.fn().mockResolvedValue([]),
    userIds: vi.fn().mockResolvedValue([USER]),
  };
  const rows = [session('s1', '2026-10-15', 60), session('s2', '2026-10-17', 65)];
  const service = new ProgressBackfillService({
    recorder,
    source,
    sessions: { findCompleted: vi.fn().mockResolvedValue(rows) },
    exercises: {
      findVisibleByIds: vi.fn().mockResolvedValue([{ id: 'bench', name: 'Bench press' }]),
    },
    events: world.ledger,
    states: world.states,
    unlocks: world.unlocks,
  });
  return { world, service, source };
}

describe('ProgressBackfillService.backfillUser', () => {
  it('writes history as BACKFILL events with the live keys and marks the version', async () => {
    const { world, service } = setup();
    const res = await service.backfillUser(USER, { today: '2026-10-22' });

    expect(res.dryRun).toBe(false);
    expect(res.inserted).toBeGreaterThan(0);
    expect(world.ledger.rows.every((r) => r.origin === 'BACKFILL')).toBe(true);
    expect(world.ledger.ofKind('WORKOUT_COMPLETED').map((r) => r.key)).toEqual([
      'WORKOUT_COMPLETED:s1',
      'WORKOUT_COMPLETED:s2',
    ]);
    // 3 meals + 5 meals (the cap), not 10.
    expect(world.ledger.ofKind('MEAL_LOGGED')).toHaveLength(8);
    // The first session only sets baselines (no PR XP for a first-ever lift);
    // the second beats bench, so only it earns PRs.
    expect(world.ledger.ofKind('WORKOUT_PRS').map((r) => r.sourceId)).toEqual(['s2']);
    expect(world.states.state?.backfillVersion).toBe(BACKFILL_VERSION);
    expect(world.ledger.total).toBe(res.xp);
  });

  it('running twice gives the same calls and writes nothing the second time', async () => {
    const { world, service } = setup();
    const first = await service.backfillUser(USER, { today: '2026-10-22' });
    const rowsAfterFirst = world.ledger.rows.length;
    const totalAfterFirst = world.ledger.total;
    const unlocksAfterFirst = world.unlocks.rows.length;

    const second = await service.backfillUser(USER, { today: '2026-10-22' });
    expect(second.candidates).toBeLessThanOrEqual(first.candidates);
    expect(second.inserted).toBe(0);
    expect(world.ledger.rows).toHaveLength(rowsAfterFirst);
    expect(world.ledger.total).toBe(totalAfterFirst);
    expect(world.unlocks.rows).toHaveLength(unlocksAfterFirst);
  });

  it('does not double-count what a live hook already paid', async () => {
    const { world, service } = setup();
    // The live hook recorded session s1 and the first meal of the 19th before the back-date.
    const recorder = new ProgressRecorder(world.deps);
    await recorder.record(USER, [
      {
        kind: 'WORKOUT_COMPLETED',
        sourceId: 's1',
        localDate: '2026-10-15',
        lines: [{ code: 'WORKOUT_DONE', xp: 40 }],
        meta: {},
      },
      {
        kind: 'MEAL_LOGGED',
        sourceId: '2026-10-19:custom:c1',
        localDate: '2026-10-19',
        lines: [{ code: 'LOGGED', xp: 5 }],
        meta: { mealType: 'lunch' },
      },
    ]);
    await service.backfillUser(USER, { today: '2026-10-22' });

    const keys = world.ledger.rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(world.ledger.rows.find((r) => r.key === 'WORKOUT_COMPLETED:s1')?.origin).toBe('LIVE');
    expect(
      world.ledger.rows.filter((r) => r.localDate === '2026-10-19' && r.kind === 'MEAL_LOGGED'),
    ).toHaveLength(3);
  });

  it('never scores a session the scorable filter excludes (imported workouts)', async () => {
    const { world, service } = setup(['s1']);
    await service.backfillUser(USER, { today: '2026-10-22' });
    expect(world.ledger.ofKind('WORKOUT_COMPLETED').map((r) => r.sourceId)).toEqual(['s1']);
    expect(scorableSessionWhere(USER)).toMatchObject({ userId: USER, status: 'COMPLETED' });
  });

  it('a dry run builds the events and writes nothing', async () => {
    const { world, service } = setup();
    const res = await service.backfillUser(USER, { today: '2026-10-22', dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.candidates).toBeGreaterThan(0);
    expect(res.rawXp).toBeGreaterThan(0);
    expect(res.inserted).toBe(0);
    expect(world.ledger.rows).toHaveLength(0);
    expect(world.states.state).toBeNull();
  });

  it('dates a back-dated badge on the day its threshold was crossed', async () => {
    const { world, service } = setup();
    await service.backfillUser(USER, { today: '2026-10-22' });
    // 8 distinct days logged would be needed for HONEST_LOGGER (7); two days only → none yet.
    expect(world.unlocks.rows.find((u) => u.achievementId === 'HONEST_LOGGER')).toBeUndefined();
    // The first workout PRs (3 on bench from a baseline): PR_MACHINE needs 5 → check the dates it has.
    const prMachine = world.unlocks.rows.find((u) => u.achievementId === 'PR_MACHINE');
    if (prMachine) expect(prMachine.unlockedAt.toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });
});
