import {
  exerciseRepository,
  parseSkippedSlots,
  progressEventRepository,
  progressSourceRepository,
  progressStateRepository,
  progressUnlockRepository,
  workoutSessionRepository,
  type IExerciseRepository,
  type IProgressEventRepository,
  type IProgressSourceRepository,
  type IProgressStateRepository,
  type IProgressUnlockRepository,
  type IWorkoutSessionRepository,
  type LoggedMealEntry,
  type PlanWithDays,
  type Prisma,
} from '@chefer/database';
import { achievementIdSchema, ACTIVE_DAY_KINDS } from '@chefer/types';
import {
  addDaysLocal,
  candidateKey,
  candidateXp,
  collectPrs,
  dateOnlyKey,
  dayCandidates,
  levelForXp,
  limitMealsPerDay,
  newUnlocks,
  shopDoneCandidate,
  summarizeFlame,
  toSessionSummary,
  weekStartOf,
  workoutCandidates,
  type ProgressCandidate,
} from '@chefer/utils';
import { toSessionDoc } from '../gym/mappers.js';
import { buildDayFacts, resolvePlanMeals } from './day-facts.js';
import type { DatedValue } from './progress-flame.js';
import { progressRecorder, type ProgressRecorder } from './progress-recorder.js';
import { parseGoalHistory, parsePauses } from './progress-state-json.js';
import { buildUnlockDates } from './progress-unlock-dates.js';

// ─── Back-dating (docs/gamification-2026-10/tech-plan.md §7) ──────────────────
// Turns a user's existing history into ledger events with `origin: BACKFILL`.
// The keys are the SAME as the live hooks', so it can run any number of times
// and overlaps with anything recorded since deploy pay nothing twice.
//
//   workouts     WORKOUT_COMPLETED + WORKOUT_PRS from one chronological collectPrs pass
//   food         MEAL_LOGGED per entry (5 a day) + FULL_DAY, the plan resolved per week.
//                PROTEIN_GOAL is NOT back-dated: the target in force on an old day is unknown.
//   shopping     SHOP_DONE for lists with every key checked, dated on the plan week's Sunday
//   cooks        none: before CookLog the server never knew
//   derived      WEEK_GOAL per met week, and achievements dated when the threshold was crossed

/** Bump when a rule change should re-run the back-date for everyone. */
export const BACKFILL_VERSION = 1;

/** How many events one recorder call appends (a transaction per call). */
const CHUNK_SIZE = 40;

/**
 * Which workout sessions may score. ONE place for the filter.
 * TODO(lane-G importSource): Strong/Hevy imports write sessions with a nullable
 * `importSource`; they never score. Add `importSource: null` here once Lane G lands.
 */
export function scorableSessionWhere(userId: string): Prisma.WorkoutSessionWhereInput {
  return { userId, status: 'COMPLETED' };
}

export type BackfillResult = {
  /** Candidates built from history (before the keys already paid are dropped). */
  candidates: number;
  /** Raw XP of those candidates, before the soft cap. */
  rawXp: number;
  /** Rows actually written (0 on a repeat run, and on a dry run). */
  inserted: number;
  /** XP written. */
  xp: number;
  unlocks: number;
  dryRun: boolean;
};

export type BackfillDeps = {
  recorder: Pick<ProgressRecorder, 'record' | 'counters' | 'userToday' | 'deps'>;
  source: IProgressSourceRepository;
  sessions: Pick<IWorkoutSessionRepository, 'findCompleted'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  events: IProgressEventRepository;
  states: IProgressStateRepository;
  unlocks: IProgressUnlockRepository;
};

export class ProgressBackfillService {
  private resolved: BackfillDeps | null = null;

  constructor(private readonly overrides: Partial<BackfillDeps> = {}) {}

  private get deps(): BackfillDeps {
    this.resolved ??= {
      recorder: progressRecorder,
      source: progressSourceRepository,
      sessions: workoutSessionRepository,
      exercises: exerciseRepository,
      events: progressEventRepository,
      states: progressStateRepository,
      unlocks: progressUnlockRepository,
      ...this.overrides,
    };
    return this.resolved;
  }

  async backfillUser(
    userId: string,
    opts: { today?: string; dryRun?: boolean } = {},
  ): Promise<BackfillResult> {
    const d = this.deps;
    const dryRun = opts.dryRun === true;
    const today = opts.today ?? (await d.recorder.userToday(userId));
    const existing = await d.events.listAll(userId);
    const paid = new Set(existing.map((e) => e.key));
    const mealsByDate = new Map<string, number>();
    for (const e of existing) {
      if (e.kind === 'MEAL_LOGGED')
        mealsByDate.set(e.localDate, (mealsByDate.get(e.localDate) ?? 0) + 1);
    }

    const candidates = [
      ...(await this.workoutCandidates(userId)),
      ...(await this.foodCandidates(userId, paid, mealsByDate)),
      ...(await this.shoppingCandidates(userId)),
    ];
    // Chronological: the soft cap then applies per day just as it would have live.
    const ordered = dedupe(candidates).sort((a, b) => a.localDate.localeCompare(b.localDate));
    const result: BackfillResult = {
      candidates: ordered.length,
      rawXp: ordered.reduce((n, c) => n + candidateXp(c), 0),
      inserted: 0,
      xp: 0,
      unlocks: 0,
      dryRun,
    };
    if (dryRun) return result;

    await d.states.ensure(userId);
    for (const chunk of chunks(ordered)) {
      const res = await d.recorder.record(userId, chunk, {
        origin: 'BACKFILL',
        today,
        skipUnlocks: true,
      });
      result.inserted += res.inserted.length;
      result.xp += res.totalAfter - res.totalBefore;
    }
    // Weeks completed by live events alone, and the rest of the derived rewards.
    const settled = await d.recorder.record(userId, [], {
      origin: 'BACKFILL',
      today,
      skipUnlocks: true,
      force: true,
      allWeeks: true,
    });
    result.inserted += settled.inserted.length;
    result.xp += settled.totalAfter - settled.totalBefore;

    result.unlocks = await this.insertUnlocks(userId, today);
    await d.states.update(userId, { backfillVersion: BACKFILL_VERSION });
    return result;
  }

  // ─── Sources ────────────────────────────────────────────────────────────────

  private async workoutCandidates(userId: string): Promise<ProgressCandidate[]> {
    const d = this.deps;
    const rows = await d.sessions.findCompleted(userId, {});
    if (rows.length === 0) return [];
    const scorable = new Set(await d.source.sessionIds(scorableSessionWhere(userId)));
    // Imported history still counts as the baseline the PRs are compared with.
    // A first-ever lift is a baseline, not beating your past self: it earns no PR XP.
    const prs = collectPrs(rows.map((r) => toSessionSummary(toSessionDoc(r)))).filter(
      (pr) => !pr.isFirst,
    );
    const names = new Map(
      (await d.exercises.findVisibleByIds(userId, [...new Set(prs.map((p) => p.exerciseId))])).map(
        (e) => [e.id, e.name],
      ),
    );
    return rows
      .filter((row) => scorable.has(row.id))
      .flatMap((row) =>
        workoutCandidates({
          sessionId: row.id,
          localDate: row.localDate,
          prs: prs
            .filter((pr) => pr.sessionId === row.id)
            .map((pr) => ({ kind: pr.kind, exerciseName: names.get(pr.exerciseId) ?? 'Exercise' })),
        }),
      );
  }

  private async foodCandidates(
    userId: string,
    paid: ReadonlySet<string>,
    mealsByDate: ReadonlyMap<string, number>,
  ): Promise<ProgressCandidate[]> {
    const d = this.deps;
    const [logs, plans] = await Promise.all([d.source.dailyLogs(userId), d.source.plans(userId)]);
    if (logs.length === 0) return [];
    const planByWeek = newestPlanPerWeek(plans);
    const recipeIds = [
      ...new Set(
        plans.flatMap((p) =>
          p.days.flatMap((day) =>
            (day.meals as unknown as { recipeId: string }[]).map((m) => m.recipeId),
          ),
        ),
      ),
    ];
    const known = new Map(
      (recipeIds.length > 0 ? await d.recorder.deps.plans.findRecipesByIds(recipeIds) : []).map(
        (r) => [r.id, { name: r.name }],
      ),
    );

    const out: ProgressCandidate[] = [];
    for (const log of logs) {
      const date = dateOnlyKey(log.date);
      const planMeals = await resolvePlanMeals(
        d.recorder.deps.plans,
        planByWeek.get(weekStartOf(date))?.days,
        date,
        known,
      );
      const facts = buildDayFacts({
        date,
        entries: (log.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [],
        skippedSlots: parseSkippedSlots(log.skippedSlots),
        planMeals,
        totals: {
          kcal: log.totalKcal,
          proteinG: log.totalProtein,
          carbsG: log.totalCarbs,
          fatG: log.totalFat,
        },
        proteinTargetG: null, // not back-dated: the target in force that day is unknown
      });
      const all = dayCandidates(facts);
      const isMeal = (c: ProgressCandidate) => c.kind === 'MEAL_LOGGED';
      const newMeals = dedupe(all.filter(isMeal)).filter(
        (c) => !paid.has(candidateKey(c.kind, c.sourceId)),
      );
      out.push(
        ...limitMealsPerDay(mealsByDate.get(date) ?? 0, newMeals),
        ...all.filter((c) => !isMeal(c)),
      );
    }
    return out;
  }

  private async shoppingCandidates(userId: string): Promise<ProgressCandidate[]> {
    const d = this.deps;
    const lists = await d.source.shoppingLists(userId);
    const out: ProgressCandidate[] = [];
    for (const list of lists) {
      const progress = await d.recorder.deps.shopping.progress(userId, list.planId);
      if (!progress || progress.total === 0 || progress.unchecked > 0) continue;
      const monday = weekStartOf(list.weekStartDate.toISOString().slice(0, 10));
      out.push(shopDoneCandidate({ planId: list.planId, localDate: addDaysLocal(monday, 6) }));
    }
    return out;
  }

  // ─── Achievements, dated when the threshold was crossed ─────────────────────

  private async insertUnlocks(userId: string, today: string): Promise<number> {
    const d = this.deps;
    const [counters, held, ledger, activeDates, state] = await Promise.all([
      d.recorder.counters(userId, today),
      d.unlocks.list(userId),
      d.events.listAll(userId),
      d.events.activeDates(userId, ACTIVE_DAY_KINDS),
      d.states.find(userId),
    ]);
    const fresh = newUnlocks(
      counters,
      held.flatMap((u) => {
        const id = achievementIdSchema.safeParse(u.achievementId);
        return id.success ? [{ achievementId: id.data, tier: u.tier }] : [];
      }),
    );
    if (fresh.length === 0) return 0;

    const weekEnds = weekEndsFrom(activeDates, today);
    const level = levelForXp(state?.totalXp ?? 0).level;
    const goalHistory = parseGoalHistory(state?.goalHistory);
    const pauses = parsePauses(state?.pauses);
    const flameBest: DatedValue[] = weekEnds.map((date) => ({
      date,
      value: summarizeFlame({
        activeDates: activeDates.filter((a) => a <= date),
        goalHistory,
        pauses,
        today: addDaysLocal(date, 1),
        level,
        training: null,
      }).best,
    }));
    const trainingBest = await d.recorder.deps.gym.trainingBestAt(userId, weekEnds);
    const dates = buildUnlockDates({
      events: ledger.map((e) => ({
        kind: e.kind,
        localDate: e.localDate,
        meta: typeof e.meta === 'object' && e.meta !== null && !Array.isArray(e.meta) ? e.meta : {},
      })),
      flameBest,
      trainingBest,
    });
    const now = d.recorder.deps.now();
    const created = await d.unlocks.insertMany(
      userId,
      fresh.map((u) => {
        const date = dates.get(`${u.achievementId}:${u.tier}`);
        return {
          achievementId: u.achievementId,
          tier: u.tier,
          unlockedAt: date ? new Date(`${date}T12:00:00.000Z`) : now,
        };
      }),
    );
    return created.length;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupe(candidates: ProgressCandidate[]): ProgressCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = candidateKey(c.kind, c.sourceId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Chunks of about CHUNK_SIZE events that never split one day across calls. */
function chunks(ordered: ProgressCandidate[]): ProgressCandidate[][] {
  const out: ProgressCandidate[][] = [];
  let current: ProgressCandidate[] = [];
  for (const candidate of ordered) {
    const last = current[current.length - 1];
    if (current.length >= CHUNK_SIZE && last && last.localDate !== candidate.localDate) {
      out.push(current);
      current = [];
    }
    current.push(candidate);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** The plan `planForDate` would find for each week: the newest non-template plan. */
function newestPlanPerWeek(plans: PlanWithDays[]): Map<string, PlanWithDays> {
  const byWeek = new Map<string, PlanWithDays>();
  for (const plan of plans) {
    // `plans` is oldest first, so a later plan of the same week replaces an earlier one.
    byWeek.set(weekStartOf(plan.weekStartDate.toISOString().slice(0, 10)), plan);
  }
  return byWeek;
}

/** The Sunday of every week from the first active date up to `today`'s week. */
function weekEndsFrom(activeDates: string[], today: string): string[] {
  const first = activeDates[0];
  if (!first) return [];
  const out: string[] = [];
  for (let wk = weekStartOf(first); wk <= weekStartOf(today); wk = addDaysLocal(wk, 7)) {
    out.push(addDaysLocal(wk, 6));
  }
  return out;
}

// Re-exported for the script and tests.
export const progressBackfillService = new ProgressBackfillService();
