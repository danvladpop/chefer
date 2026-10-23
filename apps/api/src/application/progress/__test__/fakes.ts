import type {
  AppendOptions,
  AppendResult,
  IProgressEventRepository,
  IProgressQuestDayRepository,
  IProgressStateRepository,
  IProgressUnlockRepository,
  LedgerCounters,
  LedgerLight,
  NewProgressEvent,
  NewUnlock,
  ProgressEvent,
  ProgressQuestDay,
  ProgressScorer,
  ProgressState,
  ProgressUnlock,
  WeekStats,
} from '@chefer/database';
import { ACTIVE_DAY_KINDS } from '@chefer/types';
import type { ProgressRecorderDeps } from '../progress-recorder.js';

// ─── In-memory Kitchen progress world for unit tests ──────────────────────────
// Mimics the repositories' contracts closely enough to test the pipeline: the
// ledger skips a key it already holds, applies the scorer per day in order and
// keeps the state's total equal to the sum of the rows.

export const USER = 'u1';

let clock = Date.parse('2026-10-22T10:00:00.000Z');
export const tick = (): Date => new Date((clock += 1000));

export class FakeLedger implements IProgressEventRepository {
  rows: ProgressEvent[] = [];
  total = 0;
  appendCalls: NewProgressEvent[][] = [];

  append(
    userId: string,
    events: NewProgressEvent[],
    score: ProgressScorer,
    opts: AppendOptions,
  ): Promise<AppendResult> {
    this.appendCalls.push(events);
    const totalBefore = this.total;
    const inserted: ProgressEvent[] = [];
    for (const event of events) {
      if (this.rows.some((r) => r.userId === userId && r.key === event.key)) continue;
      const dayXp = this.rows
        .filter(
          (r) =>
            r.userId === userId &&
            r.localDate === event.localDate &&
            !opts.uncappedKinds.includes(r.kind),
        )
        .reduce((n, r) => n + r.xp, 0);
      const { xp } = score(event, dayXp);
      const row: ProgressEvent = {
        id: `e${this.rows.length + 1}`,
        userId,
        key: event.key,
        kind: event.kind,
        sourceId: event.sourceId,
        localDate: event.localDate,
        xp,
        lines: event.lines as never,
        meta: event.meta as never,
        origin: event.origin,
        rulesVersion: event.rulesVersion,
        createdAt: event.createdAt ?? tick(),
      };
      this.rows.push(row);
      inserted.push(row);
      this.total += xp;
    }
    return Promise.resolve({ inserted, totalBefore, totalAfter: this.total });
  }

  dayEvents(_u: string, localDate: string) {
    return Promise.resolve(this.rows.filter((r) => r.localDate === localDate));
  }
  activeDates(_u: string, kinds: readonly string[]) {
    return Promise.resolve(
      [...new Set(this.rows.filter((r) => kinds.includes(r.kind)).map((r) => r.localDate))].sort(),
    );
  }
  counters(): Promise<LedgerCounters> {
    const count = (kind: string) => this.rows.filter((r) => r.kind === kind).length;
    const meta = (r: ProgressEvent) => r.meta as Record<string, unknown>;
    return Promise.resolve({
      welcome: count('WELCOME') > 0 ? 1 : 0,
      cooks: count('COOK_FINISHED'),
      distinctRecipesCooked: new Set(
        this.rows.filter((r) => r.kind === 'COOK_FINISHED').map((r) => meta(r)['recipeId']),
      ).size,
      daysLogged: new Set(this.rows.filter((r) => r.kind === 'MEAL_LOGGED').map((r) => r.localDate))
        .size,
      fullDays: count('FULL_DAY'),
      proteinDays: count('PROTEIN_GOAL'),
      prs: this.rows
        .filter((r) => r.kind === 'WORKOUT_PRS')
        .reduce((n, r) => n + Number(meta(r)['prCount'] ?? 0), 0),
      shopsDone: count('SHOP_DONE'),
      todaysThreeDays: count('TODAYS_THREE'),
    });
  }
  since(_u: string, cursor: Date | null, limit: number) {
    return Promise.resolve(
      this.rows
        .filter(
          (r) => r.origin === 'LIVE' && r.kind !== 'WELCOME' && (!cursor || r.createdAt > cursor),
        )
        .slice(0, limit),
    );
  }
  bySource(_u: string, kind: string, sourceId: string) {
    return Promise.resolve(this.rows.find((r) => r.key === `${kind}:${sourceId}`) ?? null);
  }
  weekStats(): Promise<WeekStats> {
    return Promise.resolve({
      xp: 0,
      xpBefore: 0,
      mealsLogged: 0,
      cooked: 0,
      newRecipes: 0,
      workouts: 0,
      prs: 0,
      activeDates: [],
    });
  }
  listAll(): Promise<LedgerLight[]> {
    return Promise.resolve([...this.rows]);
  }
  datesOfKind(_u: string, kind: string) {
    return Promise.resolve(this.rows.filter((r) => r.kind === kind).map((r) => r.localDate));
  }
  totalXp() {
    return Promise.resolve(this.total);
  }
  ofKind(kind: string): ProgressEvent[] {
    return this.rows.filter((r) => r.kind === kind);
  }
}

export class FakeStates implements IProgressStateRepository {
  state: ProgressState | null = null;
  constructor(private readonly ledger: FakeLedger) {}

  private base(): ProgressState {
    return {
      userId: USER,
      totalXp: 0,
      settings: {} as never,
      goalHistory: [] as never,
      pauses: [] as never,
      backfillVersion: null,
      introducedAt: null,
      seenCursor: null,
      lastSeenLevel: 1,
      recapSeenWeek: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    };
  }
  private current(): ProgressState {
    this.state = { ...(this.state ?? this.base()), totalXp: this.ledger.total };
    return this.state;
  }
  find() {
    return Promise.resolve(this.state || this.ledger.rows.length > 0 ? this.current() : null);
  }
  ensure() {
    return Promise.resolve(this.current());
  }
  update(_u: string, patch: Parameters<IProgressStateRepository['update']>[1]) {
    this.state = { ...this.current(), ...(patch as object) } as ProgressState;
    return Promise.resolve(this.state);
  }
  advanceSeenCursor(_u: string, upTo: Date) {
    const s = this.current();
    if (!s.seenCursor || s.seenCursor < upTo) this.state = { ...s, seenCursor: upTo };
    return Promise.resolve();
  }
  raiseLastSeenLevel(_u: string, level: number) {
    const s = this.current();
    if (s.lastSeenLevel < level) this.state = { ...s, lastSeenLevel: level };
    return Promise.resolve();
  }
}

export class FakeUnlocks implements IProgressUnlockRepository {
  rows: ProgressUnlock[] = [];
  list() {
    return Promise.resolve([...this.rows]);
  }
  insertMany(userId: string, unlocks: NewUnlock[], seenAt: Date | null = null) {
    const created: ProgressUnlock[] = [];
    for (const u of unlocks) {
      if (this.rows.some((r) => r.achievementId === u.achievementId && r.tier === u.tier)) continue;
      const row = { id: `k${this.rows.length + 1}`, userId, seenAt, ...u };
      this.rows.push(row);
      created.push(row);
    }
    return Promise.resolve(created);
  }
  markSeen(_u: string, ids: string[] | null, at: Date) {
    let n = 0;
    this.rows = this.rows.map((r) => {
      if (r.seenAt || (ids && !ids.includes(r.id))) return r;
      n += 1;
      return { ...r, seenAt: at };
    });
    return Promise.resolve(n);
  }
}

export class FakeQuestDays implements IProgressQuestDayRepository {
  rows = new Map<string, ProgressQuestDay>();
  find(userId: string, localDate: string) {
    return Promise.resolve(this.rows.get(`${userId}:${localDate}`) ?? null);
  }
  createIfAbsent(userId: string, localDate: string, quests: readonly object[]) {
    const key = `${userId}:${localDate}`;
    if (!this.rows.has(key)) {
      this.rows.set(key, { userId, localDate, quests: quests as never });
    }
    return Promise.resolve(this.rows.get(key)!);
  }
}

export type World = ReturnType<typeof makeWorld>;

/** A recorder dependency set over in-memory fakes; override any piece per test. */
export function makeWorld(over: Partial<ProgressRecorderDeps> = {}) {
  const ledger = new FakeLedger();
  const states = new FakeStates(ledger);
  const unlocks = new FakeUnlocks();
  const questDays = new FakeQuestDays();
  const deps: ProgressRecorderDeps = {
    events: ledger,
    states,
    unlocks,
    questDays,
    dailyLogs: { findByDate: () => Promise.resolve(null), findLastN: () => Promise.resolve([]) },
    plans: {
      findForWeek: () => Promise.resolve(null),
      findRecipesByIds: () => Promise.resolve([]),
    },
    profiles: { findByUserId: () => Promise.resolve(null) },
    proteinTarget: () => Promise.resolve(null),
    sessions: { findCompleted: () => Promise.resolve([]) },
    exercises: { findVisibleByIds: () => Promise.resolve([]) },
    gym: {
      trainingStreak: () => Promise.resolve(null),
      trainingBestAt: () => Promise.resolve([]),
    },
    shopping: { progress: () => Promise.resolve(null) },
    now: () => new Date('2026-10-22T10:00:00.000Z'),
    ...over,
  };
  return { ledger, states, unlocks, questDays, deps };
}

export const ACTIVE = ACTIVE_DAY_KINDS;
