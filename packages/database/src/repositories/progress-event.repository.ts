import type { Prisma, ProgressEvent } from '@prisma/client';
import { prisma } from '../client';

// ─── ProgressEventRepository (docs/gamification-2026-10/tech-plan.md §2, §4.1) ─
// The append-only Kitchen progress ledger. Every write goes through `append`:
// one SERIALIZABLE transaction that skips keys already paid, applies the
// daily soft cap to what is left and keeps `ProgressState.totalXp` equal to
// the sum of the rows. Rows are never updated or deleted (ADR 0003).

export type ProgressOrigin = 'LIVE' | 'BACKFILL';

/** Same shape as `ReceiptLine` in @chefer/types (this package cannot import it). */
export type LedgerLine = { code: string; xp: number; detail?: string | undefined };

/** One reward to write; `xp` is decided inside the transaction by the scorer. */
export type NewProgressEvent = {
  /** `<KIND>:<sourceId>`, unique per user. */
  key: string;
  kind: string;
  sourceId: string;
  localDate: string;
  /** Receipt lines before the soft cap. */
  lines: LedgerLine[];
  /** `ReceiptMeta` in @chefer/types: recipeId, mealType, prCount, weekStart, … */
  meta: Record<string, unknown>;
  origin: ProgressOrigin;
  rulesVersion: number;
  /** Back-dating only: leave unset for live rows (the database stamps them). */
  createdAt?: Date;
};

/**
 * What an event earns on a day that already holds `dayXpBefore` capped XP.
 * Injected by the API (the pure `scoreAgainstDay` rule lives in @chefer/utils,
 * which this package does not depend on).
 */
export type ProgressScorer = (event: NewProgressEvent, dayXpBefore: number) => { xp: number };

export type AppendOptions = {
  /** Kinds that do not count towards a day's capped XP (bonuses). */
  uncappedKinds: readonly string[];
};

export type AppendResult = {
  /** The rows written by this call, in the order given. Keys already present are not in here. */
  inserted: ProgressEvent[];
  totalBefore: number;
  totalAfter: number;
};

/** Ledger-derived counters for the achievements (the API adds the gym streak and the Flame). */
export type LedgerCounters = {
  welcome: number;
  cooks: number;
  distinctRecipesCooked: number;
  daysLogged: number;
  fullDays: number;
  proteinDays: number;
  prs: number;
  shopsDone: number;
  todaysThreeDays: number;
};

export type WeekStats = {
  /** XP earned by events dated inside the week. */
  xp: number;
  /** Lifetime XP of events dated before the week. */
  xpBefore: number;
  mealsLogged: number;
  cooked: number;
  /** Cooks that earned the first-time line. */
  newRecipes: number;
  workouts: number;
  /** Sum of `meta.prCount` over the week's `WORKOUT_PRS` events. */
  prs: number;
  /** Distinct active days (meal, cook or workout). */
  activeDates: string[];
};

export type LedgerLight = Pick<
  ProgressEvent,
  'key' | 'kind' | 'sourceId' | 'localDate' | 'xp' | 'meta' | 'origin' | 'createdAt'
>;

export interface IProgressEventRepository {
  append(
    userId: string,
    events: NewProgressEvent[],
    score: ProgressScorer,
    opts: AppendOptions,
  ): Promise<AppendResult>;
  dayEvents(userId: string, localDate: string): Promise<ProgressEvent[]>;
  /** Distinct local dates with at least one of `kinds`, ascending. */
  activeDates(userId: string, kinds: readonly string[]): Promise<string[]>;
  counters(userId: string): Promise<LedgerCounters>;
  /** Live rows created after `cursor` (all when null), oldest first. WELCOME is not a moment. */
  since(userId: string, cursor: Date | null, limit: number): Promise<ProgressEvent[]>;
  bySource(userId: string, kind: string, sourceId: string): Promise<ProgressEvent | null>;
  weekStats(userId: string, weekStart: string): Promise<WeekStats>;
  /** The whole ledger without lines, oldest first (back-dating and the unlock dates). */
  listAll(userId: string): Promise<LedgerLight[]>;
  /** Dates of `kind` events, ascending, one per row. */
  datesOfKind(userId: string, kind: string): Promise<string[]>;
  totalXp(userId: string): Promise<number>;
}

const APPEND_ATTEMPTS = 5;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function metaOf(row: { meta: Prisma.JsonValue }): Record<string, unknown> {
  return typeof row.meta === 'object' && row.meta !== null && !Array.isArray(row.meta)
    ? row.meta
    : {};
}

export class ProgressEventRepository implements IProgressEventRepository {
  async append(
    userId: string,
    events: NewProgressEvent[],
    score: ProgressScorer,
    opts: AppendOptions,
  ): Promise<AppendResult> {
    if (events.length === 0) {
      const total = await this.totalXp(userId);
      return { inserted: [], totalBefore: total, totalAfter: total };
    }
    // Same retry shape as DailyLogRepository.mutateDayState: the loser of a
    // serializable conflict (P2034), or of a race on the same key (P2002),
    // runs again on top of the winner's rows and finds the key already paid.
    for (let attempt = 1; ; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const present = new Set(
              (
                await tx.progressEvent.findMany({
                  where: { userId, key: { in: events.map((e) => e.key) } },
                  select: { key: true },
                })
              ).map((r) => r.key),
            );
            const fresh = events.filter((e) => {
              if (present.has(e.key)) return false;
              present.add(e.key);
              return true;
            });
            const state = await tx.progressState.findUnique({
              where: { userId },
              select: { totalXp: true },
            });
            const totalBefore = state?.totalXp ?? 0;
            if (fresh.length === 0) return { inserted: [], totalBefore, totalAfter: totalBefore };

            const dates = [...new Set(fresh.map((e) => e.localDate))];
            const sums = await tx.progressEvent.groupBy({
              by: ['localDate'],
              where: {
                userId,
                localDate: { in: dates },
                kind: { notIn: [...opts.uncappedKinds] },
              },
              _sum: { xp: true },
            });
            const dayXp = new Map(sums.map((s) => [s.localDate, s._sum.xp ?? 0]));

            const inserted: ProgressEvent[] = [];
            let gained = 0;
            for (const event of fresh) {
              const before = dayXp.get(event.localDate) ?? 0;
              const { xp } = score(event, before);
              const row = await tx.progressEvent.create({
                data: {
                  userId,
                  key: event.key,
                  kind: event.kind,
                  sourceId: event.sourceId,
                  localDate: event.localDate,
                  xp,
                  lines: event.lines,
                  meta: event.meta as Prisma.InputJsonValue,
                  origin: event.origin,
                  rulesVersion: event.rulesVersion,
                  ...(event.createdAt && { createdAt: event.createdAt }),
                },
              });
              inserted.push(row);
              gained += xp;
              if (!opts.uncappedKinds.includes(event.kind)) {
                dayXp.set(event.localDate, before + xp);
              }
            }
            await tx.progressState.upsert({
              where: { userId },
              create: { userId, totalXp: gained },
              update: { totalXp: { increment: gained } },
            });
            return { inserted, totalBefore, totalAfter: totalBefore + gained };
          },
          { isolationLevel: 'Serializable', timeout: 30_000, maxWait: 10_000 },
        );
      } catch (err) {
        const conflict =
          typeof err === 'object' &&
          err !== null &&
          ['P2034', 'P2002'].includes((err as { code?: string }).code ?? '');
        if (!conflict || attempt >= APPEND_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 25));
      }
    }
  }

  async dayEvents(userId: string, localDate: string): Promise<ProgressEvent[]> {
    return prisma.progressEvent.findMany({
      where: { userId, localDate },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async activeDates(userId: string, kinds: readonly string[]): Promise<string[]> {
    const rows = await prisma.progressEvent.findMany({
      where: { userId, kind: { in: [...kinds] } },
      distinct: ['localDate'],
      select: { localDate: true },
      orderBy: { localDate: 'asc' },
    });
    return rows.map((r) => r.localDate);
  }

  async counters(userId: string): Promise<LedgerCounters> {
    const [byKind, mealDates, cooks, prRows] = await Promise.all([
      prisma.progressEvent.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } }),
      prisma.progressEvent.findMany({
        where: { userId, kind: 'MEAL_LOGGED' },
        distinct: ['localDate'],
        select: { localDate: true },
      }),
      prisma.progressEvent.findMany({
        where: { userId, kind: 'COOK_FINISHED' },
        select: { meta: true },
      }),
      prisma.progressEvent.findMany({
        where: { userId, kind: 'WORKOUT_PRS' },
        select: { meta: true },
      }),
    ]);
    const count = (kind: string) => byKind.find((g) => g.kind === kind)?._count._all ?? 0;
    const recipes = new Set(
      cooks.map((c) => metaOf(c)['recipeId']).filter((id): id is string => typeof id === 'string'),
    );
    return {
      welcome: count('WELCOME') > 0 ? 1 : 0,
      cooks: count('COOK_FINISHED'),
      distinctRecipesCooked: recipes.size,
      daysLogged: mealDates.length,
      fullDays: count('FULL_DAY'),
      proteinDays: count('PROTEIN_GOAL'),
      prs: prRows.reduce((sum, r) => {
        const n = metaOf(r)['prCount'];
        return sum + (typeof n === 'number' ? n : 0);
      }, 0),
      shopsDone: count('SHOP_DONE'),
      todaysThreeDays: count('TODAYS_THREE'),
    };
  }

  async since(userId: string, cursor: Date | null, limit: number): Promise<ProgressEvent[]> {
    return prisma.progressEvent.findMany({
      where: {
        userId,
        origin: 'LIVE',
        kind: { not: 'WELCOME' },
        ...(cursor && { createdAt: { gt: cursor } }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async bySource(userId: string, kind: string, sourceId: string): Promise<ProgressEvent | null> {
    return prisma.progressEvent.findUnique({
      where: { userId_key: { userId, key: `${kind}:${sourceId}` } },
    });
  }

  async weekStats(userId: string, weekStart: string): Promise<WeekStats> {
    const weekEnd = addDays(weekStart, 6);
    const [rows, before] = await Promise.all([
      prisma.progressEvent.findMany({
        where: { userId, localDate: { gte: weekStart, lte: weekEnd } },
        select: { kind: true, localDate: true, xp: true, lines: true, meta: true },
      }),
      prisma.progressEvent.aggregate({
        where: { userId, localDate: { lt: weekStart } },
        _sum: { xp: true },
      }),
    ]);
    const active = new Set<string>();
    const stats: WeekStats = {
      xp: 0,
      xpBefore: before._sum.xp ?? 0,
      mealsLogged: 0,
      cooked: 0,
      newRecipes: 0,
      workouts: 0,
      prs: 0,
      activeDates: [],
    };
    for (const row of rows) {
      stats.xp += row.xp;
      if (row.kind === 'MEAL_LOGGED') stats.mealsLogged += 1;
      if (row.kind === 'COOK_FINISHED') {
        stats.cooked += 1;
        const lines = Array.isArray(row.lines) ? (row.lines as { code?: string }[]) : [];
        if (lines.some((l) => l.code === 'FIRST_TIME')) stats.newRecipes += 1;
      }
      if (row.kind === 'WORKOUT_COMPLETED') stats.workouts += 1;
      if (row.kind === 'WORKOUT_PRS') {
        const n = metaOf(row)['prCount'];
        stats.prs += typeof n === 'number' ? n : 0;
      }
      if (['MEAL_LOGGED', 'COOK_FINISHED', 'WORKOUT_COMPLETED'].includes(row.kind)) {
        active.add(row.localDate);
      }
    }
    stats.activeDates = [...active].sort();
    return stats;
  }

  async listAll(userId: string): Promise<LedgerLight[]> {
    return prisma.progressEvent.findMany({
      where: { userId },
      select: {
        key: true,
        kind: true,
        sourceId: true,
        localDate: true,
        xp: true,
        meta: true,
        origin: true,
        createdAt: true,
      },
      orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async datesOfKind(userId: string, kind: string): Promise<string[]> {
    const rows = await prisma.progressEvent.findMany({
      where: { userId, kind },
      select: { localDate: true },
      orderBy: { localDate: 'asc' },
    });
    return rows.map((r) => r.localDate);
  }

  async totalXp(userId: string): Promise<number> {
    const state = await prisma.progressState.findUnique({
      where: { userId },
      select: { totalXp: true },
    });
    return state?.totalXp ?? 0;
  }
}

export const progressEventRepository = new ProgressEventRepository();
