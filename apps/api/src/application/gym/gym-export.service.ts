import {
  exerciseRepository,
  gymProfileRepository,
  workoutSessionRepository,
  type IExerciseRepository,
  type IGymProfileRepository,
  type IWorkoutSessionRepository,
  type SessionExerciseWithSets,
} from '@chefer/database';
import type { WeightUnit } from '@chefer/types';
import { formatLoadNumber, unitLabel } from '@chefer/utils';

// ─── gym.export.csv (gym_plan.md §4.2, research §5.2 #5) ─────────────────────
// "Offer CSV export of the full history from day one" — a blocking-modal /
// data-trap anti-pattern research flags apps for skipping. One row per SET,
// oldest COMPLETED session first, so a spreadsheet import sorts naturally.
//
// Capped at MAX_ROWS so a pathological history (or a bug elsewhere writing
// duplicate sets) can't build an unbounded string in memory or response body.
// The cap is silent — matching the plan's "additive, no new failure surface"
// spirit — because a partial-but-usable export beats an error on a screen
// whose whole point is "never lose data".

export interface GymExportResult {
  filename: string;
  csv: string;
}

const MAX_ROWS = 50_000;

const HEADER = (unit: WeightUnit): string[] => [
  'Date',
  'Session',
  'Exercise',
  'Set #',
  'Warm-up',
  'Weight (kg)',
  `Weight (${unitLabel(unit)})`,
  'Reps',
  'RIR',
  'Notes',
];

export class GymExportService {
  constructor(
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly profileRepo: IGymProfileRepository = gymProfileRepository,
  ) {}

  async exportCsv(userId: string): Promise<GymExportResult> {
    const [profile, sessions] = await Promise.all([
      this.profileRepo.findByUserId(userId),
      // Oldest first (findCompleted's contract), DISCARDED/IN_PROGRESS excluded.
      this.sessionRepo.findCompleted(userId),
    ]);
    const unit: WeightUnit = profile?.unit ?? 'KG';

    const exerciseIds = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
    const names = await this.exerciseNames(userId, exerciseIds);

    const rows: string[][] = [];
    outer: for (const session of sessions) {
      const exercises = [...session.exercises].sort((a, b) => a.position - b.position);
      for (const exercise of exercises) {
        for (const row of exerciseRows(
          exercise,
          names.get(exercise.exerciseId) ?? exercise.exerciseId,
          unit,
        )) {
          if (rows.length >= MAX_ROWS) break outer;
          rows.push([session.localDate, session.name, ...row]);
        }
      }
    }

    const lines = [HEADER(unit), ...rows].map((row) => row.map(escapeCsvField).join(','));
    return { filename: exportFilename(), csv: lines.join('\r\n') };
  }

  /** Curated + the caller's own custom exercises (including archived — history needs them). */
  private async exerciseNames(userId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.exerciseRepo.findVisibleByIds(userId, ids);
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

/** One string[] per set (excluding date/session, prepended by the caller). */
function exerciseRows(
  exercise: SessionExerciseWithSets,
  exerciseName: string,
  unit: WeightUnit,
): string[][] {
  const sets = [...exercise.sets].sort((a, b) => a.position - b.position);
  const lastWorkingId = [...sets].reverse().find((s) => !s.isWarmup)?.id ?? null;
  return sets.map((set, index) => [
    exerciseName,
    String(set.position + 1),
    set.isWarmup ? 'y' : 'n',
    formatLoadNumber(set.weightKg, 'KG'),
    formatLoadNumber(set.weightKg, unit),
    String(set.reps),
    set.id === lastWorkingId ? formatRir(exercise.lastSetRir) : '',
    index === 0 ? (exercise.notes ?? '') : '',
  ]);
}

function formatRir(rir: number | null): string {
  if (rir === null) return '';
  return rir >= 3 ? '3+' : String(rir);
}

function exportFilename(): string {
  return `chefer-gym-history-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** RFC 4180 escaping: quote a field that contains a comma, quote or newline. */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const gymExportService = new GymExportService();
