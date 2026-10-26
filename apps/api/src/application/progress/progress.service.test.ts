import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CookLog, ICookLogRepository } from '@chefer/database';
import { makeWorld, USER } from './__test__/fakes.js';
import { ProgressRecorder } from './progress-recorder.js';
import { ProgressService, type ProgressServiceDeps } from './progress.service.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-22T10:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

class FakeCookLogs implements ICookLogRepository {
  rows: CookLog[] = [];
  createIfAbsent(data: Parameters<ICookLogRepository['createIfAbsent']>[0]) {
    const existing = this.rows.find((r) => r.id === data.id);
    if (existing) return Promise.resolve({ log: existing, created: false });
    const log: CookLog = { ...data, createdAt: new Date() };
    this.rows.push(log);
    return Promise.resolve({ log, created: true });
  }
  countForUser(userId: string) {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId).length);
  }
  hasEarlierForRecipe(userId: string, recipeId: string, before: Date, excludeId: string) {
    return Promise.resolve(
      this.rows.some(
        (r) =>
          r.userId === userId &&
          r.recipeId === recipeId &&
          r.id !== excludeId &&
          r.finishedAt < before,
      ),
    );
  }
  listInRange() {
    return Promise.resolve([]);
  }
}

function setup(over: Partial<ProgressServiceDeps> = {}, world = makeWorld()) {
  const cookLogs = new FakeCookLogs();
  const recorder = new ProgressRecorder(world.deps);
  const backfillUser = vi.fn().mockResolvedValue({});
  const service = new ProgressService({
    recorder,
    backfill: { backfillUser },
    recap: { weeklyRecap: vi.fn() },
    cookLogs,
    visibleRecipeName: (_u, id) => Promise.resolve(id === 'r1' ? 'Shakshuka' : null),
    liftPlanned: () => Promise.resolve(false),
    isEnabled: () => true,
    ...over,
  });
  return { service, world, cookLogs, backfillUser, recorder };
}

const user = { id: USER, email: 'ana@chefer.dev' };
const cookInput = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  recipeId: 'r1',
  localDate: '2026-10-22',
  finishedAt: new Date('2026-10-22T09:30:00.000Z'),
  ...over,
});

describe('ProgressService.finishCook', () => {
  it('stores the cook and returns the receipt, the first time bonus included', async () => {
    const { service, cookLogs } = setup();
    const res = await service.finishCook(user, cookInput('11111111-1111-4111-8111-111111111111'));

    expect(cookLogs.rows).toHaveLength(1);
    expect(res.receipt?.kind).toBe('COOK_FINISHED');
    expect(res.receipt?.lines.map((l) => l.code)).toEqual(['COOKED_AT_HOME', 'FIRST_TIME']);
    expect(res.receipt?.meta).toMatchObject({
      recipeId: 'r1',
      recipeName: 'Shakshuka',
      cookCount: 1,
    });
  });

  it('twice with the same id is one cook log and one event', async () => {
    const { service, cookLogs, world } = setup();
    const id = '22222222-2222-4222-8222-222222222222';
    const first = await service.finishCook(user, cookInput(id));
    const second = await service.finishCook(user, cookInput(id));

    expect(cookLogs.rows).toHaveLength(1);
    expect(world.ledger.ofKind('COOK_FINISHED')).toHaveLength(1);
    expect(second.receipt?.id).toBe(first.receipt?.id);
    expect(second.levelUp).toBeNull();
  });

  it('with progress off still writes the cook log and the event, but returns no receipt', async () => {
    const { service, cookLogs, world } = setup({ isEnabled: () => false });
    const res = await service.finishCook(user, cookInput('33333333-3333-4333-8333-333333333333'));

    expect(res).toEqual({ receipt: null, unlocks: [], levelUp: null });
    expect(cookLogs.rows).toHaveLength(1);
    expect(world.ledger.ofKind('COOK_FINISHED')).toHaveLength(1);
  });

  it('is not a first time when an earlier cook of the recipe exists', async () => {
    const { service } = setup();
    await service.finishCook(
      user,
      cookInput('44444444-4444-4444-8444-444444444444', {
        finishedAt: new Date('2026-10-20T18:00:00.000Z'),
        localDate: '2026-10-20',
      }),
    );
    const res = await service.finishCook(user, cookInput('55555555-5555-4555-8555-555555555555'));
    expect(res.receipt?.lines.map((l) => l.code)).toEqual(['COOKED_AT_HOME']);
    expect(res.receipt?.meta.cookCount).toBe(2);
  });

  it('records a cook of a recipe the user cannot see without the recipe', async () => {
    const { service, cookLogs } = setup();
    const res = await service.finishCook(
      user,
      cookInput('66666666-6666-4666-8666-666666666666', { recipeId: 'someone-elses' }),
    );
    expect(cookLogs.rows[0]?.recipeId).toBeNull();
    expect(res.receipt?.meta.recipeId).toBeUndefined();
    expect(res.receipt?.lines.map((l) => l.code)).toEqual(['COOKED_AT_HOME']);
  });

  it("reads another user's cook id as not found", async () => {
    const { service, cookLogs } = setup();
    cookLogs.rows.push({
      id: '77777777-7777-4777-8777-777777777777',
      userId: 'other',
      recipeId: null,
      localDate: '2026-10-22',
      startedAt: null,
      finishedAt: new Date(),
      createdAt: new Date(),
    });
    await expect(
      service.finishCook(user, cookInput('77777777-7777-4777-8777-777777777777')),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('ProgressService.summary', () => {
  it('back-dates once, pays WELCOME, sets the level and cursor so history is not a storm', async () => {
    const { service, backfillUser, world } = setup();
    const first = await service.summary(user, '2026-10-22');

    expect(backfillUser).toHaveBeenCalledWith(USER, { today: '2026-10-22' });
    expect(world.ledger.ofKind('WELCOME')).toHaveLength(1);
    expect(first.xp.total).toBe(28);
    expect(first.intro).toEqual({ backdatedXp: 0, badges: 0 });
    expect(world.unlocks.rows.every((u) => u.seenAt !== null)).toBe(true);

    await service.markSeen(USER, { intro: true });
    const second = await service.summary(user, '2026-10-22');
    expect(second.intro).toBeNull();
    expect(world.ledger.ofKind('WELCOME')).toHaveLength(1);
  });

  it('skips the back-date when the version is current', async () => {
    const world = makeWorld();
    await world.states.update(USER, { backfillVersion: 1 });
    const { service, backfillUser } = setup({}, world);
    await service.summary(user, '2026-10-22');
    expect(backfillUser).not.toHaveBeenCalled();
  });

  it('keeps the quest set fixed once shown and marks a quest done from the ledger', async () => {
    const { service, recorder, world } = setup();
    const before = await service.summary(user, '2026-10-22');
    expect(before.todaysThree?.quests.map((q) => q.kind)).toEqual(['LOG_ANY']);
    expect(before.todaysThree?.quests[0]?.done).toBe(false);

    await recorder.record(USER, [
      {
        kind: 'MEAL_LOGGED',
        sourceId: '2026-10-22:custom:a',
        localDate: '2026-10-22',
        lines: [{ code: 'LOGGED', xp: 5 }],
        meta: { mealType: 'lunch' },
      },
    ]);
    const after = await service.summary(user, '2026-10-22');
    expect(after.todaysThree?.quests[0]?.done).toBe(true);
    expect(after.todaysThree?.allDone).toBe(true);
    expect(world.ledger.ofKind('TODAYS_THREE')).toHaveLength(1);
  });

  it('has no protein quest for numbers mode NONE (the raw column), and does for FULL', async () => {
    const profile = (numbersMode: string) =>
      ({ numbersMode, biologicalSex: null, timeZone: null }) as never;
    const none = setup(
      {},
      makeWorld({
        profiles: { findByUserId: () => Promise.resolve(profile('NONE')) },
        proteinTarget: () => Promise.resolve(120),
      }),
    );
    const hidden = await none.service.summary(user, '2026-10-22');
    expect(hidden.todaysThree?.quests.map((q) => q.kind)).not.toContain('PROTEIN');

    const full = setup(
      {},
      makeWorld({
        profiles: { findByUserId: () => Promise.resolve(profile('FULL')) },
        proteinTarget: () => Promise.resolve(120),
      }),
    );
    const shown = await full.service.summary(user, '2026-10-22');
    expect(shown.todaysThree?.quests.map((q) => q.kind)).toContain('PROTEIN');
  });

  // Lane E3: the protein reward leaves the shelf with the quest.
  it('leaves Protein pro off the achievements shelf for numbers mode NONE', async () => {
    const profile = (numbersMode: string) =>
      ({ numbersMode, biologicalSex: null, timeZone: null }) as never;
    const ids = async (numbersMode: string) => {
      const { service } = setup(
        {},
        makeWorld({ profiles: { findByUserId: () => Promise.resolve(profile(numbersMode)) } }),
      );
      const dto = await service.achievements(USER);
      return dto.groups.flatMap((g) => g.items.map((i) => i.id));
    };
    expect(await ids('NONE')).not.toContain('PROTEIN_PRO');
    expect(await ids('FULL')).toContain('PROTEIN_PRO');
  });

  it('offers a recap on Sunday only once, and only for a week with activity', async () => {
    const world = makeWorld();
    world.ledger.weekStats = () =>
      Promise.resolve({
        xp: 40,
        xpBefore: 0,
        mealsLogged: 3,
        cooked: 0,
        newRecipes: 0,
        workouts: 0,
        prs: 0,
        activeDates: ['2026-10-19'],
      });
    const { service } = setup({}, world);
    // 2026-10-25 is a Sunday.
    const open = await service.summary(user, '2026-10-25');
    expect(open.recap).toEqual({ weekStart: '2026-10-19' });

    await service.markSeen(USER, { recapWeek: '2026-10-19' });
    expect((await service.summary(user, '2026-10-25')).recap).toBeNull();
  });
});

describe('ProgressService.inbox and ack', () => {
  it('shows nothing before the welcome card', async () => {
    const { service, recorder } = setup();
    await recorder.record(USER, [
      {
        kind: 'MEAL_LOGGED',
        sourceId: '2026-10-22:custom:a',
        localDate: '2026-10-22',
        lines: [{ code: 'LOGGED', xp: 5 }],
        meta: {},
      },
    ]);
    expect(await service.inbox(USER)).toEqual({
      receipts: [],
      unlocks: [],
      levelUp: null,
      cursor: null,
    });
  });

  it('log a meal → inbox has the receipt → ack empties it', async () => {
    const { service, recorder } = setup();
    await service.summary(user, '2026-10-22');
    await recorder.record(USER, [
      {
        kind: 'MEAL_LOGGED',
        sourceId: '2026-10-22:custom:a',
        localDate: '2026-10-22',
        lines: [{ code: 'LOGGED', xp: 5 }],
        meta: { mealType: 'lunch' },
      },
    ]);

    const inbox = await service.inbox(USER);
    // The meal completed the day's single quest, so the bonus arrives with it.
    expect(inbox.receipts.map((r) => r.kind)).toEqual(['MEAL_LOGGED', 'TODAYS_THREE']);
    expect(inbox.cursor).not.toBeNull();

    await service.ack(USER, { upTo: inbox.cursor });
    expect((await service.inbox(USER)).receipts).toEqual([]);
  });

  it('reports a level-up once, and a late ack for a lower level changes nothing', async () => {
    const { service, recorder } = setup();
    await service.summary(user, '2026-10-22');
    // 140 XP crosses level 1 (needs 140).
    await recorder.record(
      USER,
      [1, 2, 3, 4, 5].map((n) => ({
        kind: 'WORKOUT_COMPLETED' as const,
        sourceId: `s${n}`,
        localDate: `2026-10-${10 + n}`,
        lines: [{ code: 'WORKOUT_DONE' as const, xp: 40 }],
        meta: {},
      })),
    );
    const inbox = await service.inbox(USER);
    expect(inbox.levelUp).toMatchObject({ from: 1, to: 2 });

    await service.ack(USER, { level: 2 });
    expect((await service.inbox(USER)).levelUp).toBeNull();
    await service.ack(USER, { level: 1 });
    expect((await service.inbox(USER)).levelUp).toBeNull();
    // An ack beyond the level reached cannot skip a future level-up.
    await service.ack(USER, { level: 99 });
    expect((await service.inbox(USER)).levelUp).toBeNull();
  });
});

describe('ProgressService settings, goal and pause', () => {
  it('merges a patch over the defaults, the reminder field by field', async () => {
    const { service } = setup();
    expect(await service.updateSettings(USER, { celebrations: 'SUBTLE' })).toMatchObject({
      celebrations: 'SUBTLE',
      showXp: true,
    });
    const next = await service.updateSettings(USER, { reminder: { enabled: true } });
    expect(next.reminder).toEqual({ enabled: true, time: '19:30' });
    expect(next.celebrations).toBe('SUBTLE');
  });

  it('appends the goal from this week, replaces the same week, keeps the default before it', async () => {
    const { service, world } = setup();
    await service.setActiveDayGoal(USER, 5, '2026-10-22');
    await service.setActiveDayGoal(USER, 4, '2026-10-21');
    const info = await service.setActiveDayGoal(USER, 6, '2026-10-29');

    expect(world.states.state?.goalHistory).toEqual([
      { fromWeek: '2020-01-06', goal: 3 },
      { fromWeek: '2026-10-19', goal: 4 },
      { fromWeek: '2026-10-26', goal: 6 },
    ]);
    expect(info.goal).toBe(6);
  });

  it('pauses up to 4 weeks and resumeFlame ends the pause yesterday', async () => {
    const { service, world } = setup();
    const paused = await service.pauseFlame(USER, '2026-10-22', 2);
    expect(paused.pausedUntil).toBe('2026-11-04');

    const resumed = await service.resumeFlame(USER, '2026-10-26');
    expect(resumed.pausedUntil).toBeNull();
    expect(world.states.state?.pauses).toEqual([
      { startDate: '2026-10-22', endDate: '2026-10-25' },
    ]);
    // A pause that starts today is removed.
    await service.pauseFlame(USER, '2026-11-10', 1);
    await service.resumeFlame(USER, '2026-11-10');
    expect(world.states.state?.pauses).toEqual([
      { startDate: '2026-10-22', endDate: '2026-10-25' },
    ]);
  });
});

describe('ProgressService.receiptFor', () => {
  it('folds a workout and its PRs into one receipt', async () => {
    const { service, recorder } = setup();
    await recorder.record(USER, [
      {
        kind: 'WORKOUT_COMPLETED',
        sourceId: 'sess',
        localDate: '2026-10-22',
        lines: [{ code: 'WORKOUT_DONE', xp: 40 }],
        meta: {},
      },
      {
        kind: 'WORKOUT_PRS',
        sourceId: 'sess',
        localDate: '2026-10-22',
        lines: [{ code: 'PR_E1RM', xp: 20, detail: 'Bench press' }],
        meta: { prCount: 1 },
      },
    ]);
    const receipt = await service.receiptFor(USER, 'WORKOUT', 'sess');
    expect(receipt?.xp).toBe(60);
    expect(receipt?.lines.map((l) => l.code)).toEqual(['WORKOUT_DONE', 'PR_E1RM']);
    expect(await service.receiptFor(USER, 'WORKOUT', 'nope')).toBeNull();
  });
});
