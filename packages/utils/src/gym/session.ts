// Session-level assembly shared by the API (bootstrap) and clients (offline
// optimistic update after Finish): next-workout building, rotation, and
// session → exposure mapping.
import type {
  CarryOverList,
  EquipmentProfile,
  ExerciseSlot,
  Exposure,
  GymBootstrap,
  GymProfileDto,
  NextWorkoutDto,
  NextWorkoutExerciseDto,
  ProgressionDto,
  ProgressionOverride,
  ProgressionState,
  Rir,
  RoutineDto,
  RoutineExerciseDto,
  SessionSetDoc,
  SessionSummaryDto,
  TrainingProfileFacts,
  WorkoutSessionDoc,
} from '@chefer/types';
import { nextCarryOver } from './carry-over';
import { deloadContinues } from './deload';
import { durationMinutes } from './duration';
import {
  applyExposure,
  carriedWeightKg,
  initialState,
  prescribe,
  progressionKey,
  repBucket,
} from './progression';
import { collectPrs } from './prs';
import type { ExerciseLookup } from './volume';
import { warmupSets } from './warmups';
import { addDaysLocal, settleWeeks, weekdayOf, weekStartOf, type WeekRow } from './weeks';

export interface ProgressionEntry {
  state: ProgressionState;
  override: ProgressionOverride | null;
}

function toRir(v: number | null): Rir | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null;
}

/** GymProfileDto → the engine's equipment inventory. */
export function equipmentProfileOf(profile: GymProfileDto): EquipmentProfile {
  return {
    unit: profile.unit,
    barWeightKg: profile.barWeightKg,
    platePairsKg: profile.platePairsKg,
    dumbbellsKg: profile.dumbbellsKg,
    machineStepKg: profile.machineStepKg,
    cableStepKg: profile.cableStepKg,
    hasDipBelt: profile.hasDipBelt,
    microPlates: profile.microPlates,
  };
}

function sortedDays(routine: RoutineDto): RoutineDto['days'] {
  return [...routine.days].sort((a, b) => a.position - b.position);
}

/** Next day in the rotation after `completedDayId` (wraps; unknown id → first day). */
export function nextDayIdAfter(routine: RoutineDto, completedDayId: string | null): string | null {
  const days = sortedDays(routine);
  const idx = completedDayId === null ? -1 : days.findIndex((d) => d.id === completedDayId);
  if (idx < 0) {
    return days[0]?.id ?? null;
  }
  return days[(idx + 1) % days.length]?.id ?? null;
}

/**
 * R-19: the weekday the "Next session" line should name once something has
 * been trained today. The rotation's next day carries the weekday it was
 * pinned to (`plannedWeekday`), but a session done off-schedule leaves that
 * pin in the past ("Next session: Wednesday" on a Thursday) — a calendar
 * can't go backwards. So: a pin still ahead of `today` stands; otherwise
 * (pinned today or earlier this week) it's the next planned training weekday
 * after today — any routine day's pin — wrapping into next week (the earliest
 * pin) when none is left this week. A day with no fixed weekday, or a routine
 * with no pinned days, stays `null` (the card then says no weekday).
 * 0 = Monday … 6 = Sunday.
 */
export function nextSessionWeekday(input: {
  activeRoutine: RoutineDto | null | undefined;
  nextDayId: string | null | undefined;
  today: string;
}): number | null {
  const { activeRoutine, nextDayId, today } = input;
  if (!activeRoutine || !nextDayId) return null;
  const pinned = activeRoutine.days.find((d) => d.id === nextDayId)?.plannedWeekday ?? null;
  if (pinned === null) return null;
  const todayWeekday = weekdayOf(today);
  if (pinned > todayWeekday) return pinned;

  const planned = [
    ...new Set(
      activeRoutine.days.map((d) => d.plannedWeekday).filter((w): w is number => w !== null),
    ),
  ].sort((a, b) => a - b);
  return planned.find((w) => w > todayWeekday) ?? planned[0] ?? null;
}

export type TodayStatus =
  /**
   * Nothing done today, and the rotation's next day is due today, has no
   * fixed weekday, or is overdue — show Start. `overdueFrom` is set when the
   * day was pinned to an earlier weekday this week and hasn't happened yet
   * (0 = Monday … 6 = Sunday), so the card can say "Planned for Monday".
   */
  | { kind: 'training'; overdueFrom?: number }
  /** A session was already completed today: `nextWorkout` (the rotation's now-next day) is upcoming, not today's. */
  | { kind: 'done'; dayName: string; weekday: number | null }
  /** Nothing done today, but the rotation's next day is due a different weekday — offer it anyway. */
  | { kind: 'rest'; dayName: string; weekday: number | null };

/**
 * Bug B-15 (T-05.9): `bootstrap.nextWorkout` is always "the rotation's next
 * day", which advances the instant Finish runs — so right after finishing
 * day A today, it already points at day B, and Gym Today would offer B with
 * a Start button on the SAME day. This classifies today so the caller can
 * show `Done today` (no Start) or `Rest day` (`Start {day} anyway`) instead
 * of blindly rendering whatever `nextWorkout` says.
 */
export function todayStatus(input: {
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'nextWorkout' | 'activeRoutine'>;
  today: string;
}): TodayStatus {
  const { bootstrap, today } = input;
  const doneToday = bootstrap.recentSessions.some(
    (s) => s.status === 'COMPLETED' && s.localDate === today,
  );
  const next = bootstrap.nextWorkout;
  const weekday =
    (next && bootstrap.activeRoutine?.days.find((d) => d.id === next.dayId)?.plannedWeekday) ??
    null;

  if (doneToday) {
    // R-19: not the template's pin (it can be in the past after an
    // off-schedule session) — the next planned training day after today.
    return {
      kind: 'done',
      dayName: next?.dayName ?? '',
      weekday: nextSessionWeekday({
        activeRoutine: bootstrap.activeRoutine,
        nextDayId: next?.dayId,
        today,
      }),
    };
  }
  if (!next || weekday === null || weekday === weekdayOf(today)) {
    return { kind: 'training' };
  }
  // Owner dogfood 2026-09-29: a day pinned to Monday that was missed used to
  // make Tuesday a "Rest day" pointing at *next* Monday, with no way to train
  // except "Start anyway". The rotation never advanced past it, so it is
  // overdue, not upcoming — it's today's workout.
  const overdue = missedPlannedDays({
    activeRoutine: bootstrap.activeRoutine,
    recentSessions: bootstrap.recentSessions,
    today,
  }).some((d) => d.dayId === next.dayId);
  if (overdue) {
    return { kind: 'training', overdueFrom: weekday };
  }
  return { kind: 'rest', dayName: next.dayName, weekday };
}

export interface MissedPlannedDay {
  dayId: string;
  dayName: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

/**
 * T-04.8 (UX-04 §7, rev 2): routine days pinned to a specific weekday
 * (`plannedWeekday`) earlier THIS week that have no completed session yet —
 * "Still time this week" on Gym Today. A day with no fixed weekday (a plain
 * rotation) is never "missed": only a pinned day can be. `today` itself is
 * never included (it isn't missed yet); on a Sunday every planned day of the
 * week that's still undone shows up, since there's no "later this week" left.
 */
export function missedPlannedDays(input: {
  activeRoutine: RoutineDto | null;
  recentSessions: SessionSummaryDto[];
  today: string;
}): MissedPlannedDay[] {
  const { activeRoutine, recentSessions, today } = input;
  if (!activeRoutine) return [];
  const weekStart = weekStartOf(today);
  const todayWeekday = weekdayOf(today);
  const doneThisWeekByDay = new Set(
    recentSessions
      .filter(
        (s) =>
          s.status === 'COMPLETED' &&
          s.routineDayId !== null &&
          s.localDate >= weekStart &&
          s.localDate <= today,
      )
      .map((s) => s.routineDayId),
  );
  const isMissed = (
    d: RoutineDto['days'][number],
  ): d is RoutineDto['days'][number] & { plannedWeekday: number } =>
    d.plannedWeekday !== null && d.plannedWeekday < todayWeekday && !doneThisWeekByDay.has(d.id);
  return [...activeRoutine.days]
    .filter(isMissed)
    .sort((a, b) => a.plannedWeekday - b.plannedWeekday)
    .map((d) => ({ dayId: d.id, dayName: d.name, weekday: d.plannedWeekday }));
}

export interface DoneTodayCard {
  session: SessionSummaryDto;
  durationMin: number;
  workingSets: number;
  /** How many exercises in this session set a PR (weight / reps / e1RM). */
  prCount: number;
  /** The rotation's now-next day (already advanced by Finish), for "Next session: …". */
  next: { dayName: string; weekday: number | null } | null;
}

/**
 * The `Done today` Gym Today card's data (T-05.9, bug B-15 companion): the
 * session finished today plus its stats and what's next, or null when
 * nothing was finished today (the caller falls back to `todayStatus`).
 */
export function doneTodayCard(input: {
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'nextWorkout' | 'activeRoutine' | 'olderBests'>;
  today: string;
}): DoneTodayCard | null {
  const { bootstrap, today } = input;
  const session = bootstrap.recentSessions.find(
    (s) => s.status === 'COMPLETED' && s.localDate === today,
  );
  if (!session) return null;

  const durationMin = session.finishedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
        ),
      )
    : 0;
  const workingSets = session.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !s.isWarmup && s.completed).length,
    0,
  );
  const prCount = collectPrs(bootstrap.recentSessions, undefined, bootstrap.olderBests).filter(
    (r) => r.sessionId === session.id,
  ).length;
  const next = bootstrap.nextWorkout
    ? {
        dayName: bootstrap.nextWorkout.dayName,
        // R-19: the next planned training day after today, not the weekday the
        // template was originally pinned to (see nextSessionWeekday).
        weekday: nextSessionWeekday({
          activeRoutine: bootstrap.activeRoutine,
          nextDayId: bootstrap.nextWorkout.dayId,
          today,
        }),
      }
    : null;

  return { session, durationMin, workingSets, prCount, next };
}

/** Newest first: localDate, then startedAt, then id. */
function newestFirst(a: SessionSummaryDto, b: SessionSummaryDto): number {
  return (
    b.localDate.localeCompare(a.localDate) ||
    b.startedAt.localeCompare(a.startedAt) ||
    b.id.localeCompare(a.id)
  );
}

function lastTimeFor(
  exerciseId: string,
  recentSessions: SessionSummaryDto[],
): NextWorkoutExerciseDto['lastTime'] {
  const sessions = recentSessions.filter((s) => s.status === 'COMPLETED').sort(newestFirst);
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) {
      continue;
    }
    const sets = ex.sets
      .filter((x) => !x.isWarmup && x.completed)
      .map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
    if (sets.length > 0) {
      return { localDate: s.localDate, sets, lastSetRir: ex.lastSetRir };
    }
  }
  return null;
}

interface BuildExerciseInput {
  re: RoutineExerciseDto;
  lookup: ExerciseLookup;
  progressions: ReadonlyMap<string, ProgressionEntry>;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  recentSessions: SessionSummaryDto[];
  isDeload: boolean;
  isFirstForPattern: boolean;
}

/** The progression states of the same exercise under OTHER rep buckets (UX-GYM-18). */
function siblingStates(
  progressions: ReadonlyMap<string, ProgressionEntry>,
  exerciseId: string,
  bucket: string,
): ProgressionState[] {
  const own = progressionKey(exerciseId, bucket);
  const prefix = progressionKey(exerciseId, '');
  const out: ProgressionState[] = [];
  for (const [key, entry] of progressions) {
    if (key !== own && key.startsWith(prefix)) out.push(entry.state);
  }
  return out;
}

/** One routine exercise's prescription + warm-ups + last-time column. */
function buildExercise(input: BuildExerciseInput): NextWorkoutExerciseDto | null {
  const { re, lookup, profile, facts } = input;
  const meta = lookup(re.exerciseId);
  if (!meta) return null;
  const slot: ExerciseSlot = {
    exercise: meta,
    sets: re.sets,
    repMin: re.repMin,
    repMax: re.repMax,
    targetRir: re.targetRir,
    restSec: re.restSec,
  };
  const bucket = repBucket(re.repMin, re.repMax);
  const entry = input.progressions.get(progressionKey(re.exerciseId, bucket));
  const state =
    entry?.state ??
    initialState({
      slot,
      profile,
      experience: facts.experience,
      knownWeightKg: carriedWeightKg({
        slot,
        siblings: siblingStates(input.progressions, re.exerciseId, bucket),
      }),
    });
  const suggestion = prescribe({
    slot,
    state,
    override: entry?.override ?? null,
    profile,
    facts,
    today: input.today,
    deload: input.isDeload,
  });
  return {
    routineExerciseId: re.id,
    exerciseId: re.exerciseId,
    position: 0, // renumbered by the caller
    sets: suggestion.sets,
    repMin: re.repMin,
    repMax: re.repMax,
    targetRir: re.targetRir,
    restSec: re.restSec,
    supersetGroup: re.supersetGroup,
    notes: re.notes,
    repBucket: bucket,
    suggestion,
    warmups: warmupSets({
      slot,
      workingKg: suggestion.weightKg,
      isFirstForPattern: input.isFirstForPattern,
      profile,
    }),
    lastTime: lastTimeFor(re.exerciseId, input.recentSessions),
  };
}

/**
 * Prescriptions + warm-ups + last-time columns for one routine day, with any
 * carried-over exercises (T-36.3, CI-49) prepended and tagged `fromLastTime`.
 * A carry-over item whose routine day/exercise no longer exists (the routine
 * was edited since) is silently dropped — self-healing, never an error.
 */
export function buildNextWorkout(input: {
  routine: RoutineDto;
  dayId: string;
  lookup: ExerciseLookup;
  /** Keyed by progressionKey(exerciseId, repBucket). */
  progressions: ReadonlyMap<string, ProgressionEntry>;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  recentSessions: SessionSummaryDto[];
  isDeload: boolean;
  /** `GymProfile.carryOver` — additive; omit/`[]` behaves exactly as before. */
  carryOver?: CarryOverList;
}): NextWorkoutDto {
  const { routine, lookup, profile, facts } = input;
  const day = routine.days.find((d) => d.id === input.dayId);
  if (!day) {
    throw new Error(`Routine ${routine.id} has no day ${input.dayId}`);
  }
  const seenPatterns = new Set<string>();
  const dayExerciseIds = new Set(day.exercises.map((re) => re.exerciseId));
  const buildOpts = {
    lookup,
    progressions: input.progressions,
    profile,
    facts,
    today: input.today,
    recentSessions: input.recentSessions,
    isDeload: input.isDeload,
  };

  // Carry-over first, so their movement patterns count toward "first for
  // pattern" warm-ups exactly like any other exercise would.
  const carried: NextWorkoutExerciseDto[] = [];
  const seenCarryIds = new Set<string>();
  for (const item of input.carryOver ?? []) {
    if (dayExerciseIds.has(item.exerciseId) || seenCarryIds.has(item.exerciseId)) continue;
    const sourceDay = routine.days.find((d) => d.id === item.routineDayId);
    const re = sourceDay?.exercises.find((e) => e.exerciseId === item.exerciseId);
    if (!re) continue; // routine changed since — drop silently
    const meta = lookup(item.exerciseId);
    if (!meta) continue;
    const isFirstForPattern = !seenPatterns.has(meta.movementPattern);
    seenPatterns.add(meta.movementPattern);
    const built = buildExercise({ ...buildOpts, re, isFirstForPattern });
    if (!built) continue;
    seenCarryIds.add(item.exerciseId);
    carried.push({ ...built, fromLastTime: true });
  }

  const exercises: NextWorkoutExerciseDto[] = [];
  for (const re of [...day.exercises].sort((a, b) => a.position - b.position)) {
    const meta = lookup(re.exerciseId);
    if (!meta) {
      continue;
    }
    const isFirstForPattern = !seenPatterns.has(meta.movementPattern);
    seenPatterns.add(meta.movementPattern);
    const built = buildExercise({ ...buildOpts, re, isFirstForPattern });
    if (built) exercises.push(built);
  }

  const allExercises = [...carried, ...exercises].map((e, i) => ({ ...e, position: i }));
  const estimatedMin = durationMinutes(
    {
      name: day.name,
      exercises: allExercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
      })),
    },
    lookup,
  );
  return {
    routineId: routine.id,
    dayId: day.id,
    dayName: day.name,
    isDeload: input.isDeload,
    estimatedMin,
    exercises: allExercises,
  };
}

/** One Exposure per non-skipped exercise of a COMPLETED session. */
export function exposuresFromSession(
  doc: WorkoutSessionDoc,
): { exerciseId: string; exposure: Exposure }[] {
  if (doc.status !== 'COMPLETED') {
    return [];
  }
  return [...doc.exercises]
    .sort((a, b) => a.position - b.position)
    .filter((se) => !se.skipped)
    .map((se) => ({
      exerciseId: se.exerciseId,
      exposure: {
        sessionId: doc.id,
        localDate: doc.localDate,
        performedAt: doc.startedAt,
        sets: se.prescription.sets,
        repMin: se.repMin,
        repMax: se.repMax,
        targetRir: se.targetRir,
        loggedSets: [...se.sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            weightKg: s.weightKg,
            reps: s.reps,
            isWarmup: s.isWarmup,
            completed: s.completedAt !== null,
          })),
        lastSetRir: toRir(se.lastSetRir),
        wasDeload: doc.isDeload || se.prescription.kind === 'deload',
        skipped: false,
      },
    }));
}

/**
 * S20 (T-42.2): a wire set's cardio fields are optional (undefined for a
 * strength set); `exactOptionalPropertyTypes` means the key must be OMITTED
 * rather than set to `undefined`, hence the conditional spread per field
 * instead of a plain object literal.
 */
function toSummarySet(s: SessionSetDoc): SessionSummaryDto['exercises'][number]['sets'][number] {
  return {
    weightKg: s.weightKg,
    reps: s.reps,
    isWarmup: s.isWarmup,
    completed: s.completedAt !== null,
    ...(s.durationSec !== undefined && { durationSec: s.durationSec }),
    ...(s.distanceM !== undefined && { distanceM: s.distanceM }),
    ...(s.intensityRpe !== undefined && { intensityRpe: s.intensityRpe }),
    ...(s.resistanceLevel !== undefined && { resistanceLevel: s.resistanceLevel }),
    ...(s.inclinePct !== undefined && { inclinePct: s.inclinePct }),
    ...(s.caloriesKcal !== undefined && { caloriesKcal: s.caloriesKcal }),
    ...(s.avgHeartRateBpm !== undefined && { avgHeartRateBpm: s.avgHeartRateBpm }),
  };
}

export function toSessionSummary(doc: WorkoutSessionDoc): SessionSummaryDto {
  return {
    id: doc.id,
    name: doc.name,
    routineDayId: doc.routineDayId,
    status: doc.status,
    localDate: doc.localDate,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    isDeload: doc.isDeload,
    exercises: [...doc.exercises]
      .sort((a, b) => a.position - b.position)
      .map((se) => ({
        exerciseId: se.exerciseId,
        skipped: se.skipped,
        lastSetRir: toRir(se.lastSetRir),
        notes: se.notes,
        sets: [...se.sets].sort((a, b) => a.position - b.position).map(toSummarySet),
      })),
  };
}

/** Re-settle cached weeks after adding one session on `localDate` (optimistic). */
function resettleWeeks(
  bootstrap: GymBootstrap,
  goal: number,
  localDate: string | null,
  today: string,
): Pick<GymBootstrap, 'weeks' | 'streak'> {
  const current = weekStartOf(today);
  const rows: WeekRow[] = bootstrap.weeks.map((w) => ({
    weekStart: w.weekStart,
    goal: w.goal,
    sessions: w.sessions,
    paused: w.status === 'paused',
  }));
  const lastRow = rows[rows.length - 1];
  let wk = lastRow ? addDaysLocal(lastRow.weekStart, 7) : current;
  for (; wk <= current; wk = addDaysLocal(wk, 7)) {
    rows.push({ weekStart: wk, goal, sessions: 0, paused: false });
  }
  if (localDate !== null) {
    const row = rows.find((r) => r.weekStart === weekStartOf(localDate));
    if (row) {
      row.sessions += 1;
    }
  }
  const settled = settleWeeks(rows, current);
  return {
    weeks: settled.weeks,
    streak: { ...settled.streak, best: Math.max(settled.streak.best, bootstrap.streak.best) },
  };
}

/**
 * Offline optimistic update: fold a just-finished session into a cached
 * bootstrap (progressions, rotation pointer, next workout, recent sessions,
 * weeks/streak). The server's later bootstrap must be identical.
 *
 * Contract notes for the API (G1-B) so both sides agree:
 * - an override whose `at` is not after the session's start is consumed (cleared);
 * - `bootstrap.weeks` should start at the setup week (flex tokens are re-derived);
 * - a deload week lasts `days.length` sessions (see deloadContinues).
 */
export function applyFinishedSession(input: {
  bootstrap: GymBootstrap;
  doc: WorkoutSessionDoc;
  lookup: ExerciseLookup;
  facts: TrainingProfileFacts;
  today: string;
}): GymBootstrap {
  const { bootstrap, doc, lookup, facts, today } = input;
  if (doc.status !== 'COMPLETED' || !bootstrap.profile) {
    return bootstrap;
  }
  const profile = equipmentProfileOf(bootstrap.profile);
  const routine = bootstrap.activeRoutine;
  const routineExercises = new Map(
    (routine?.days ?? []).flatMap((d) => d.exercises.map((e) => [e.id, e] as const)),
  );
  const alreadyCounted = bootstrap.recentSessions.some(
    (s) => s.id === doc.id && s.status === 'COMPLETED',
  );

  // 1. Progressions.
  const progressions: ProgressionDto[] = [...bootstrap.progressions];
  if (!alreadyCounted) {
    for (const { exerciseId, exposure } of exposuresFromSession(doc)) {
      const meta = lookup(exerciseId);
      const se = doc.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
      if (!meta || !se) {
        continue;
      }
      const bucket = repBucket(exposure.repMin, exposure.repMax);
      const idx = progressions.findIndex(
        (p) => p.exerciseId === exerciseId && p.repBucket === bucket,
      );
      const existing = idx >= 0 ? progressions[idx] : undefined;
      // A backfilled session older than this exercise's last exposure can't be
      // folded incrementally on top (the fold is chronological). Leave the
      // cached state; the server re-folds full history on sync and the next
      // bootstrap carries the right prescription.
      const lastSeen = existing?.state.lastExposureDate ?? null;
      if (lastSeen !== null && exposure.localDate < lastSeen) {
        continue;
      }
      const re = se.routineExerciseId ? routineExercises.get(se.routineExerciseId) : undefined;
      const slot: ExerciseSlot = {
        exercise: meta,
        sets: re?.sets ?? existing?.suggestion.sets ?? exposure.sets,
        repMin: exposure.repMin,
        repMax: exposure.repMax,
        targetRir: exposure.targetRir,
        restSec: se.restSec,
      };
      const prior =
        existing?.state ??
        initialState({
          slot,
          profile,
          experience: facts.experience,
          knownWeightKg: carriedWeightKg({
            slot,
            siblings: progressions
              .filter((p) => p.exerciseId === exerciseId && p.repBucket !== bucket)
              .map((p) => p.state),
          }),
        });
      const state = applyExposure({
        slot,
        state: prior,
        exposure,
        profile,
        experience: facts.experience,
      });
      const override =
        existing?.override && existing.override.at > doc.startedAt ? existing.override : null;
      const suggestion = prescribe({
        slot,
        state,
        override,
        profile,
        facts,
        today,
        deload: false,
      });
      const dto: ProgressionDto = { exerciseId, repBucket: bucket, state, override, suggestion };
      if (idx >= 0) {
        progressions[idx] = dto;
      } else {
        progressions.push(dto);
      }
    }
  }

  // 2. Recent sessions (newest first, replacing any earlier copy of this doc).
  const recentSessions = [
    toSessionSummary(doc),
    ...bootstrap.recentSessions.filter((s) => s.id !== doc.id),
  ].sort(newestFirst);

  // 3. Rotation pointer.
  let activeRoutine = routine;
  if (routine && doc.routineDayId && routine.days.some((d) => d.id === doc.routineDayId)) {
    activeRoutine = { ...routine, nextDayId: nextDayIdAfter(routine, doc.routineDayId) };
  }

  // 3b. Carry-over (T-36.3): consume whatever this doc addressed, add
  // whatever it newly carries over — mirrors the server's write exactly
  // (workout-session.service.ts) so the offline fold never drifts from it.
  const carryOver = alreadyCounted ? bootstrap.carryOver : nextCarryOver(bootstrap.carryOver, doc);

  // 4. Next workout.
  let nextWorkout = bootstrap.nextWorkout;
  if (activeRoutine?.nextDayId) {
    const map = new Map<string, ProgressionEntry>(
      progressions.map((p) => [
        progressionKey(p.exerciseId, p.repBucket),
        { state: p.state, override: p.override },
      ]),
    );
    const isDeload =
      (bootstrap.nextWorkout?.isDeload ?? false) &&
      deloadContinues(recentSessions, activeRoutine.days.length);
    nextWorkout = buildNextWorkout({
      routine: activeRoutine,
      dayId: activeRoutine.nextDayId,
      lookup,
      progressions: map,
      profile,
      facts,
      today,
      recentSessions,
      isDeload,
      carryOver,
    });
  }

  // 5. Weeks & streak.
  const { weeks, streak } = resettleWeeks(
    bootstrap,
    bootstrap.profile.weeklyGoal,
    alreadyCounted ? null : doc.localDate,
    today,
  );

  return {
    ...bootstrap,
    activeRoutine,
    nextWorkout,
    progressions,
    recentSessions,
    weeks,
    streak,
    carryOver,
  };
}
