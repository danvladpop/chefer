import {
  chefProfileRepository,
  dailyLogRepository,
  exerciseRepository,
  mealPlanRepository,
  parseSkippedSlots,
  progressEventRepository,
  progressQuestDayRepository,
  progressStateRepository,
  progressUnlockRepository,
  trainingPauseRepository,
  workoutSessionRepository,
  type IChefProfileRepository,
  type IDailyLogRepository,
  type IExerciseRepository,
  type IMealPlanRepository,
  type IProgressEventRepository,
  type IProgressQuestDayRepository,
  type IProgressStateRepository,
  type IProgressUnlockRepository,
  type IWorkoutSessionRepository,
  type LoggedMealEntry,
  type NewProgressEvent,
  type ProgressEvent,
  type ProgressScorer,
  type ProgressUnlock,
} from '@chefer/database';
import {
  achievementIdSchema,
  ACTIVE_DAY_KINDS,
  progressEventKindSchema,
  receiptMetaSchema,
} from '@chefer/types';
import {
  addDaysLocal,
  candidateKey,
  collectPrs,
  dayCandidates,
  levelForXp,
  limitMealsPerDay,
  metWeekStarts,
  newUnlocks,
  ownerLocalDate,
  questDone,
  RULES_VERSION,
  scoreAgainstDay,
  shopDoneCandidate,
  todaysThreeCandidate,
  toSessionSummary,
  UNCAPPED_KINDS,
  weekGoalCandidate,
  weekStartOf,
  workoutCandidates,
  type ProgressCandidate,
  type ProgressCounters,
} from '@chefer/utils';
import { gymContextLoader, summarizeUserWeeks } from '../gym/gym-context.js';
import { toSessionDoc } from '../gym/mappers.js';
import { planForDate } from '../meal-plan/plan-for-date.js';
import { buildDayFacts, resolvePlanMeals } from './day-facts.js';
import { FlameReader, type FlameRead, type IGymStreakReader } from './progress-flame.js';
import type { IProgressRecorder } from './progress-hooks.js';
import { parseQuests } from './progress-state-json.js';

// ─── ProgressRecorder (docs/gamification-2026-10/tech-plan.md §4.1) ───────────
// The one write path of Kitchen progress. Every hook and every back-date goes
// through `record`:
//   1. score the candidates and append them (the repository skips keys that
//      were already paid and applies the daily soft cap in one transaction);
//   2. derive the follow-on rewards: TODAYS_THREE for days with a stored quest
//      set that is now complete, WEEK_GOAL for weeks that met their goal;
//   3. evaluate the achievements and insert the tiers newly reached.
// Nothing is ever taken back (D2): removals call the hooks too, harmlessly.

/** Everything the recorder reads or writes, as interfaces (architecture rule 3). */
export type ProgressRecorderDeps = {
  events: IProgressEventRepository;
  states: IProgressStateRepository;
  unlocks: IProgressUnlockRepository;
  questDays: IProgressQuestDayRepository;
  dailyLogs: Pick<IDailyLogRepository, 'findByDate' | 'findLastN'>;
  plans: Pick<IMealPlanRepository, 'findForWeek' | 'findRecipesByIds'>;
  profiles: Pick<IChefProfileRepository, 'findByUserId'>;
  /** The protein target `tracker.getDay` shows for the date. */
  proteinTarget: (
    userId: string,
    profile: Awaited<ReturnType<IChefProfileRepository['findByUserId']>>,
    date: string,
  ) => Promise<number | null>;
  sessions: Pick<IWorkoutSessionRepository, 'findCompleted'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  gym: IGymStreakReader;
  shopping: {
    progress: (
      userId: string,
      planId: string,
    ) => Promise<{ total: number; unchecked: number } | null>;
  };
  now: () => Date;
};

/** The gym weekly streak from the real gym services. */
export const defaultGymStreakReader: IGymStreakReader = {
  async trainingStreak(userId, today) {
    const [ctx, sessionDates, pauses] = await Promise.all([
      gymContextLoader.load(userId),
      workoutSessionRepository.findCompletedDates(userId),
      trainingPauseRepository.listForUser(userId),
    ]);
    if (!ctx.profileRow) return null;
    const { streak } = summarizeUserWeeks({
      profileRow: ctx.profileRow,
      sessionDates,
      pauses: pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
      today,
    });
    return { current: streak.current, best: streak.best };
  },
  async trainingBestAt(userId, weekEnds) {
    const [ctx, sessionDates, pauses] = await Promise.all([
      gymContextLoader.load(userId),
      workoutSessionRepository.findCompletedDates(userId),
      trainingPauseRepository.listForUser(userId),
    ]);
    const { profileRow } = ctx;
    if (!profileRow) return [];
    const ranges = pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate }));
    return weekEnds.map((date) => ({
      date,
      value: summarizeUserWeeks({
        profileRow,
        sessionDates: sessionDates.filter((d) => d <= date),
        pauses: ranges,
        today: addDaysLocal(date, 1),
      }).streak.best,
    }));
  },
};

export function defaultRecorderDeps(): ProgressRecorderDeps {
  return {
    events: progressEventRepository,
    states: progressStateRepository,
    unlocks: progressUnlockRepository,
    questDays: progressQuestDayRepository,
    dailyLogs: dailyLogRepository,
    plans: mealPlanRepository,
    profiles: chefProfileRepository,
    proteinTarget: async (userId, profile, date) => {
      // Loaded on use: the nutrition service pulls in the env/AI graph.
      const { trainingNutritionService } =
        await import('../training-nutrition/training-nutrition.service.js');
      const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
      const { targets } = await trainingNutritionService.targetsForDay(
        userId,
        profile,
        { localDate: date, weekday },
        false,
      );
      return targets.proteinG;
    },
    sessions: workoutSessionRepository,
    exercises: exerciseRepository,
    gym: defaultGymStreakReader,
    shopping: {
      progress: async (userId, planId) =>
        (await import('../shopping-list/shopping-list.service.js')).shoppingListService.progressFor(
          userId,
          planId,
        ),
    },
    now: () => new Date(),
  };
}

export type RecordOptions = {
  origin?: 'LIVE' | 'BACKFILL';
  /** The user's local today (the Flame's "now"). Loaded from the profile when omitted. */
  today?: string;
  /** Skip achievements (back-dating computes its own unlock dates). */
  skipUnlocks?: boolean;
  /** Derive the follow-ons even when nothing new was appended (a goal change). */
  force?: boolean;
  /** Back-dating: derive the week goals of every week, not only the touched ones. */
  allWeeks?: boolean;
};

export type RecordResult = {
  /** Every ledger row this call wrote, derived rewards included. */
  inserted: ProgressEvent[];
  unlocks: ProgressUnlock[];
  totalBefore: number;
  totalAfter: number;
};

const EMPTY: RecordResult = { inserted: [], unlocks: [], totalBefore: 0, totalAfter: 0 };

const ACTIVE_KINDS: readonly string[] = ACTIVE_DAY_KINDS;

export function toNewEvent(
  candidate: ProgressCandidate,
  origin: 'LIVE' | 'BACKFILL',
): NewProgressEvent {
  return {
    key: candidateKey(candidate.kind, candidate.sourceId),
    kind: candidate.kind,
    sourceId: candidate.sourceId,
    localDate: candidate.localDate,
    lines: candidate.lines,
    meta: candidate.meta,
    origin,
    rulesVersion: RULES_VERSION,
  };
}

/** The repository's scorer: the pure soft-cap rule, looked up by key. */
export function scorerFor(candidates: ProgressCandidate[]): ProgressScorer {
  const byKey = new Map(candidates.map((c) => [candidateKey(c.kind, c.sourceId), c]));
  return (event, dayXpBefore) => {
    const candidate = byKey.get(event.key);
    if (!candidate) throw new Error(`No candidate for ledger key ${event.key}`);
    return scoreAgainstDay(candidate, dayXpBefore);
  };
}

export function dedupeCandidates(candidates: ProgressCandidate[]): ProgressCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = candidateKey(c.kind, c.sourceId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ledger rows as `questDone` reads them. */
export function toDayEventFacts(rows: Pick<ProgressEvent, 'kind' | 'meta'>[]) {
  return rows.flatMap((row) => {
    const kind = progressEventKindSchema.safeParse(row.kind);
    if (!kind.success) return [];
    const meta = receiptMetaSchema.safeParse(row.meta ?? {});
    return [{ kind: kind.data, meta: meta.success ? meta.data : {} }];
  });
}

export class ProgressRecorder implements IProgressRecorder {
  private resolved: ProgressRecorderDeps | null = null;

  /** Dependencies resolve on first use, so importing this module touches no repository. */
  constructor(private readonly overrides: Partial<ProgressRecorderDeps> = {}) {}

  get deps(): ProgressRecorderDeps {
    this.resolved ??= { ...defaultRecorderDeps(), ...this.overrides };
    return this.resolved;
  }

  get flame(): FlameReader {
    return new FlameReader(this.deps);
  }

  // ─── Hook entry points ──────────────────────────────────────────────────────

  async onDayChanged(userId: string, date: string): Promise<void> {
    const d = this.deps;
    const dayDate = new Date(`${date}T00:00:00.000Z`);
    const [log, plan, profile, existing] = await Promise.all([
      d.dailyLogs.findByDate(userId, dayDate),
      planForDate(d.plans, userId, date),
      d.profiles.findByUserId(userId),
      d.events.dayEvents(userId, date),
    ]);
    if (!log) return; // nothing logged: a removal that emptied the day

    const entries = (log.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const planMeals = await resolvePlanMeals(d.plans, plan?.days, date);
    const proteinTargetG = await d.proteinTarget(userId, profile, date);
    const facts = buildDayFacts({
      date,
      entries,
      skippedSlots: parseSkippedSlots(log.skippedSlots),
      planMeals,
      totals: {
        kcal: log.totalKcal,
        proteinG: log.totalProtein,
        carbsG: log.totalCarbs,
        fatG: log.totalFat,
      },
      proteinTargetG,
    });

    // The pure rule doesn't cap meals: drop keys already paid, then keep only
    // as many new meals as the day still has room for (5 a day earn).
    const paid = new Set(existing.map((e) => e.key));
    const all = dayCandidates(facts);
    const isMeal = (c: ProgressCandidate) => c.kind === 'MEAL_LOGGED';
    const newMeals = dedupeCandidates(all.filter(isMeal)).filter(
      (c) => !paid.has(candidateKey(c.kind, c.sourceId)),
    );
    const mealsToday = existing.filter((e) => e.kind === 'MEAL_LOGGED').length;
    const candidates = [
      ...limitMealsPerDay(mealsToday, newMeals),
      ...all.filter((c) => !isMeal(c)),
    ];

    await this.record(userId, candidates, {
      today: maxDate(ownerLocalDate(d.now(), profile?.timeZone), date),
    });
  }

  async onWorkoutsCompleted(userId: string, sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const d = this.deps;
    const rows = await d.sessions.findCompleted(userId, {});
    const wanted = new Set(sessionIds);
    const targets = rows.filter((r) => wanted.has(r.id));
    if (targets.length === 0) return;

    // PRs exactly as gym-stats counts them: one chronological pass over the
    // completed history, so a session is compared with everything before it.
    const prs = collectPrs(rows.map((r) => toSessionSummary(toSessionDoc(r))));
    const mine = prs.filter((pr) => wanted.has(pr.sessionId));
    const names = new Map(
      (await d.exercises.findVisibleByIds(userId, [...new Set(mine.map((p) => p.exerciseId))])).map(
        (e) => [e.id, e.name],
      ),
    );
    const candidates = targets.flatMap((row) =>
      workoutCandidates({
        sessionId: row.id,
        localDate: row.localDate,
        prs: mine
          .filter((pr) => pr.sessionId === row.id)
          .map((pr) => ({ kind: pr.kind, exerciseName: names.get(pr.exerciseId) ?? 'Exercise' })),
      }),
    );
    await this.record(userId, candidates);
  }

  async onShoppingToggled(
    userId: string,
    planId: string,
    localDate: string | undefined,
  ): Promise<void> {
    const d = this.deps;
    const list = await d.shopping.progress(userId, planId);
    if (!list || list.total === 0 || list.unchecked > 0) return;
    const today = localDate ?? (await this.userToday(userId));
    await this.record(userId, [shopDoneCandidate({ planId, localDate: today })], { today });
  }

  // ─── The one write path ─────────────────────────────────────────────────────

  async record(
    userId: string,
    candidates: ProgressCandidate[],
    opts: RecordOptions = {},
  ): Promise<RecordResult> {
    const d = this.deps;
    const origin = opts.origin ?? 'LIVE';
    const unique = dedupeCandidates(candidates);
    if (unique.length === 0 && !opts.force) return EMPTY;

    const base = await d.events.append(
      userId,
      unique.map((c) => toNewEvent(c, origin)),
      scorerFor(unique),
      {
        uncappedKinds: UNCAPPED_KINDS,
      },
    );
    if (base.inserted.length === 0 && !opts.force) {
      return { ...EMPTY, totalBefore: base.totalBefore, totalAfter: base.totalAfter };
    }

    const touched = base.inserted.map((r) => r.localDate);
    const latest = touched.reduce<string | null>((a, b) => (a === null || b > a ? b : a), null);
    const today = maxDate(opts.today ?? (await this.userToday(userId)), latest);
    const level = levelForXp(base.totalAfter).level;
    const flame = await this.flame.read(userId, today, level);

    // Derived rewards, appended after the rows they depend on.
    const derived: ProgressCandidate[] = [];
    for (const date of new Set(base.inserted.map((r) => r.localDate))) {
      const questDay = await d.questDays.find(userId, date);
      const quests = parseQuests(questDay?.quests);
      if (quests.length === 0) continue;
      const facts = toDayEventFacts(await d.events.dayEvents(userId, date));
      if (quests.every((q) => questDone(q, facts))) derived.push(todaysThreeCandidate(date));
    }
    derived.push(...this.weekGoalCandidates(flame, base.inserted, opts.allWeeks === true));

    let inserted = base.inserted;
    let totalAfter = base.totalAfter;
    if (derived.length > 0) {
      const second = await d.events.append(
        userId,
        derived.map((c) => toNewEvent(c, origin)),
        scorerFor(derived),
        { uncappedKinds: UNCAPPED_KINDS },
      );
      inserted = [...inserted, ...second.inserted];
      totalAfter = second.totalAfter;
    }

    const unlocks = opts.skipUnlocks ? [] : await this.evaluateUnlocks(userId, today, flame);
    return { inserted, unlocks, totalBefore: base.totalBefore, totalAfter };
  }

  /** Re-derives the follow-on rewards with nothing new to write (a goal change). */
  async refresh(userId: string, today: string): Promise<RecordResult> {
    return this.record(userId, [], { today, force: true, allWeeks: true });
  }

  // ─── Derivations ────────────────────────────────────────────────────────────

  /** `WEEK_GOAL` for weeks that met their goal: dated on the day the goal was reached. */
  private weekGoalCandidates(
    flame: FlameRead,
    inserted: ProgressEvent[],
    allWeeks: boolean,
  ): ProgressCandidate[] {
    const touchedWeeks = new Set(
      inserted.filter((r) => ACTIVE_KINDS.includes(r.kind)).map((r) => weekStartOf(r.localDate)),
    );
    const met = metWeekStarts(flame.weeks);
    return met
      .filter((weekStart) => allWeeks || touchedWeeks.has(weekStart))
      .flatMap((weekStart) => {
        const week = flame.weeks.find((w) => w.weekStart === weekStart);
        if (!week) return [];
        const inWeek = flame.activeDates.filter((date) => weekStartOf(date) === weekStart);
        const reached = inWeek[week.goal - 1];
        return reached ? [weekGoalCandidate({ weekStart, localDate: reached })] : [];
      });
  }

  /** The counters the achievements read: the ledger, plus the gym streak and the Flame. */
  async counters(userId: string, today: string, flame?: FlameRead): Promise<ProgressCounters> {
    const d = this.deps;
    const totalXp = await d.events.totalXp(userId);
    const [ledger, training, read] = await Promise.all([
      d.events.counters(userId),
      d.gym.trainingStreak(userId, today),
      flame ?? this.flame.read(userId, today, levelForXp(totalXp).level),
    ]);
    return { ...ledger, trainingStreakBest: training?.best ?? 0, flameBest: read.best };
  }

  private async evaluateUnlocks(
    userId: string,
    today: string,
    flame: FlameRead,
  ): Promise<ProgressUnlock[]> {
    const d = this.deps;
    const [counters, held] = await Promise.all([
      this.counters(userId, today, flame),
      d.unlocks.list(userId),
    ]);
    const fresh = newUnlocks(
      counters,
      held.flatMap((u) => {
        const achievementId = achievementIdOf(u.achievementId);
        return achievementId ? [{ achievementId, tier: u.tier }] : [];
      }),
    );
    if (fresh.length === 0) return [];
    const at = d.now();
    return d.unlocks.insertMany(
      userId,
      fresh.map((u) => ({ ...u, unlockedAt: at })),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** The user's local today: their profile time zone, else UTC. */
  async userToday(userId: string): Promise<string> {
    const profile = await this.deps.profiles.findByUserId(userId);
    return ownerLocalDate(this.deps.now(), profile?.timeZone);
  }
}

const maxDate = (a: string, b: string | null): string => (b !== null && b > a ? b : a);

function achievementIdOf(value: string) {
  const parsed = achievementIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The recorder the hooks resolve on first use. */
export const progressRecorder = new ProgressRecorder();
