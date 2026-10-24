import {
  LB_PER_KG,
  type ImportedExercise,
  type ImportedSet,
  type ImportedSetKind,
  type ImportedWorkout,
  type WeightUnit,
  type WorkoutCsvParseResult,
  type WorkoutImportSource,
} from '@chefer/types';
import { parseCsv } from '../csv';

// ─── Strong / Hevy CSV → workouts (G2, market review 2026-10) ─────────────────
// Neither app publishes a column spec; these layouts come from real exports
// (docs/market-review-2026-10 G2 notes, fixtures in __fixtures__/):
//
// Strong A (2019→, `;`, every field quoted)
//   "Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";
//   "Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"
// Strong B (older iOS, `,`, NO unit anywhere — the user has to say kg or lb)
//   Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
// Strong C (legacy, `;` or `,`, a unit per row, decimal commas in `;` files)
//   Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;
//   Distance Unit;Seconds;Notes;Workout Notes;Workout Duration
// Hevy (`,`; one weight and one distance column, named by the user's units)
//   title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,
//   set_index,set_type,weight_kg|weight_lbs,reps,distance_km|distance_miles,duration_seconds,rpe
//
// Strong "Set Order" is 1..N, W (warm-up), D (drop), F (failure), plus two
// rows that are not sets: "Rest Timer" (skipped) and "Note" (an exercise note).
// Neither export has a time zone: times are kept as wall-clock values.

const MILES_TO_M = 1609.344;
/** Weights above this are typos or wrong units; the set is dropped. */
const MAX_WEIGHT_KG = 1000;
/** A workout left running for days (seen in real Strong files) has no usable duration. */
const MAX_DURATION_SEC = 6 * 3600;

type Columns = Map<string, number>;

function columnsOf(header: string[]): Columns {
  return new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
}

/** A number cell: '' → null; a decimal comma is read as a decimal point. */
function num(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  const n = Number(s.includes('.') ? s : s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const positive = (n: number | null): number | null => (n !== null && n > 0 ? n : null);
const text = (raw: string | undefined): string | null => {
  const s = (raw ?? '').trim();
  return s === '' ? null : s;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

type LocalStart = { localDate: string; localTime: string; minutes: number };

function localStart(y: number, mo: number, d: number, h: number, mi: number): LocalStart | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return {
    localDate: `${y}-${pad2(mo)}-${pad2(d)}`,
    localTime: `${pad2(h)}:${pad2(mi)}`,
    minutes: Date.UTC(y, mo - 1, d, h, mi) / 60_000,
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Strong `2026-02-17 19:25:59`; Hevy `30 Jun 2025, 19:56` or `Jun 11, 2026, 1:01 PM`. */
export function parseImportDate(raw: string): LocalStart | null {
  const s = raw.trim();
  // A regex group as a number / text (groups exist whenever the regex matched).
  const n = (m: RegExpExecArray, i: number) => Number(m[i] ?? NaN);
  const t = (m: RegExpExecArray, i: number) => m[i] ?? '';
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s);
  if (m) return localStart(n(m, 1), n(m, 2), n(m, 3), n(m, 4), n(m, 5));
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i.exec(s);
  if (m) return withMonth(n(m, 3), t(m, 2), n(m, 1), n(m, 4), n(m, 5), m[6]);
  m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i.exec(s);
  if (m) return withMonth(n(m, 3), t(m, 1), n(m, 2), n(m, 4), n(m, 5), m[6]);
  return null;
}

function withMonth(
  y: number,
  month: string,
  d: number,
  h: number,
  mi: number,
  meridiem: string | undefined,
): LocalStart | null {
  const mo = MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  if (mo === 0) return null;
  let hour = h;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    hour = (h % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
  }
  return localStart(y, mo, d, hour, mi);
}

/** `4419` (seconds) or Strong's text `1h 43m` / `35m` / `38min` / `2h`. */
export function parseImportDuration(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '') return null;
  let sec: number;
  if (/^\d+(\.\d+)?$/.test(s)) {
    sec = Math.round(Number(s));
  } else {
    const h = /(\d+)\s*h/.exec(s);
    const m = /(\d+)\s*m(?:in)?\b/.exec(s);
    const sx = /(\d+)\s*s\b/.exec(s);
    if (!h && !m && !sx) return null;
    sec = Number(h?.[1] ?? 0) * 3600 + Number(m?.[1] ?? 0) * 60 + Number(sx?.[1] ?? 0);
  }
  return sec > 0 && sec <= MAX_DURATION_SEC ? sec : null;
}

const toKg = (weight: number | null, unit: WeightUnit): number => {
  if (weight === null) return 0;
  const kg = Math.abs(weight) / (unit === 'LB' ? LB_PER_KG : 1);
  return Math.round(kg * 100) / 100;
};

function unitFromCell(raw: string | undefined): WeightUnit | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'kg' || s === 'kgs') return 'KG';
  if (s === 'lb' || s === 'lbs') return 'LB';
  return null;
}

function metresFrom(distance: number | null, unit: string): number | null {
  const d = positive(distance);
  if (d === null) return null;
  const u = unit.trim().toLowerCase();
  if (u === 'm' || u === 'meters' || u === 'metres') return d;
  if (u === 'mi' || u === 'miles' || u === 'mile') return Math.round(d * MILES_TO_M);
  if (u === 'ft' || u === 'feet') return Math.round(d * 0.3048);
  return Math.round(d * 1000); // km, and the fallback
}

// ─── Accumulating rows into workouts ─────────────────────────────────────────

type Draft = {
  workout: ImportedWorkout;
  byName: Map<string, ImportedExercise>;
};

class WorkoutAccumulator {
  private readonly drafts = new Map<string, Draft>();
  skippedRows = 0;

  constructor(private readonly source: WorkoutImportSource) {}

  workout(groupKey: string, init: () => Omit<ImportedWorkout, 'key' | 'exercises'>): Draft {
    let draft = this.drafts.get(groupKey);
    if (!draft) {
      const base = init();
      draft = {
        workout: {
          key: `${this.source}|${base.localDate}T${base.localTime}|${base.title}`,
          ...base,
          exercises: [],
        },
        byName: new Map(),
      };
      this.drafts.set(groupKey, draft);
    }
    return draft;
  }

  exercise(draft: Draft, name: string): ImportedExercise {
    // One block per exercise: a name seen twice in a workout (a superset in
    // Hevy) keeps adding to its first block.
    let ex = draft.byName.get(name);
    if (!ex) {
      ex = { name, notes: null, sets: [] };
      draft.byName.set(name, ex);
      draft.workout.exercises.push(ex);
    }
    return ex;
  }

  /** Workouts with at least one set, oldest first. */
  result(): ImportedWorkout[] {
    return [...this.drafts.values()]
      .map((d) => ({
        ...d.workout,
        exercises: d.workout.exercises.filter((e) => e.sets.length > 0),
      }))
      .filter((w) => w.exercises.length > 0)
      .sort(
        (a, b) =>
          a.localDate.localeCompare(b.localDate) ||
          a.localTime.localeCompare(b.localTime) ||
          a.title.localeCompare(b.title),
      );
  }
}

function addNote(ex: ImportedExercise, note: string | null): void {
  if (!note) return;
  if (ex.notes === null) ex.notes = note;
  else if (!ex.notes.split(' · ').includes(note)) ex.notes = `${ex.notes} · ${note}`;
}

/** A set worth keeping: something was logged, and the weight is plausible. */
function pushSet(acc: WorkoutAccumulator, ex: ImportedExercise, set: ImportedSet): void {
  const empty =
    set.weightKg === 0 && !set.reps && set.distanceM === null && set.durationSec === null;
  if (empty || set.weightKg > MAX_WEIGHT_KG) {
    acc.skippedRows++;
    return;
  }
  ex.sets.push(set);
}

const roundReps = (n: number | null): number | null =>
  n === null ? null : Math.max(0, Math.round(n));
const rpeOf = (n: number | null): number | null => (n !== null && n >= 1 && n <= 10 ? n : null);

// ─── Strong ──────────────────────────────────────────────────────────────────

function strongKind(order: string): ImportedSetKind | 'rest' | 'note' | null {
  const o = order.trim().toUpperCase();
  if (/^\d+$/.test(o)) return 'normal';
  if (o === 'W') return 'warmup';
  if (o === 'D') return 'drop';
  if (o === 'F') return 'failure';
  if (o === 'REST TIMER') return 'rest';
  if (o === 'NOTE') return 'note';
  return null;
}

function parseStrong(
  rows: string[][],
  fallbackUnit: WeightUnit | undefined,
): WorkoutCsvParseResult {
  const cols = columnsOf(rows[0] ?? []);
  const col = (...names: string[]) => names.map((n) => cols.get(n)).find((i) => i !== undefined);
  const iDate = col('date');
  const iName = col('exercise name');
  const iOrder = col('set order');
  if (iDate === undefined || iName === undefined || iOrder === undefined) {
    return { ok: false, reason: 'unknown_format', source: 'STRONG' };
  }
  const iNumber = col('workout #');
  const iTitle = col('workout name');
  const iDuration = col('duration (sec)', 'duration', 'workout duration');
  const iReps = col('reps');
  const iRpe = col('rpe');
  const iSeconds = col('seconds');
  const iNotes = col('notes');
  const iWorkoutNotes = col('workout notes');
  const iWeightUnit = col('weight unit');
  const iDistanceUnit = col('distance unit');

  // The weight column names its unit (layout A), or each row does (layout C),
  // or nothing does (layout B) and the user's answer is needed.
  const weightHeader = [...cols.keys()].find((k) => k.startsWith('weight') && k !== 'weight unit');
  const iWeight = weightHeader === undefined ? undefined : cols.get(weightHeader);
  const headerUnit: WeightUnit | null = weightHeader?.includes('(kg')
    ? 'KG'
    : weightHeader?.includes('(lb')
      ? 'LB'
      : null;
  const fileUnit = headerUnit ?? (iWeightUnit !== undefined ? null : (fallbackUnit ?? null));
  if (headerUnit === null && iWeightUnit === undefined && !fallbackUnit) {
    return { ok: false, reason: 'needs_unit', source: 'STRONG' };
  }
  const distanceHeader = [...cols.keys()].find(
    (k) => k.startsWith('distance') && k !== 'distance unit',
  );
  const iDistance = distanceHeader === undefined ? undefined : cols.get(distanceHeader);
  // "Distance (meters)" names its unit; a bare "Distance" follows the weight unit (km / mi).
  const headerDistanceUnit = /\((.+)\)/.exec(distanceHeader ?? '')?.[1] ?? null;

  const acc = new WorkoutAccumulator('STRONG');
  const rowUnits = new Map<WeightUnit, number>();
  for (const row of rows.slice(1)) {
    const start = parseImportDate(row[iDate] ?? '');
    const name = text(row[iName]);
    const kind = strongKind(row[iOrder] ?? '');
    if (!start || !name || kind === null) {
      acc.skippedRows++;
      continue;
    }
    const title = text(iTitle === undefined ? undefined : row[iTitle]) ?? 'Workout';
    const groupKey =
      (iNumber !== undefined ? text(row[iNumber]) : null) ?? `${row[iDate]}|${title}`;
    const draft = acc.workout(groupKey, () => ({
      title,
      localDate: start.localDate,
      localTime: start.localTime,
      durationSec: parseImportDuration(iDuration === undefined ? undefined : row[iDuration]),
      notes: text(iWorkoutNotes === undefined ? undefined : row[iWorkoutNotes]),
    }));
    const ex = acc.exercise(draft, name);
    const note = text(iNotes === undefined ? undefined : row[iNotes]);
    if (kind === 'rest') continue;
    if (kind === 'note') {
      addNote(ex, note);
      continue;
    }
    addNote(ex, note);
    const unit =
      unitFromCell(iWeightUnit === undefined ? undefined : row[iWeightUnit]) ?? fileUnit ?? 'KG';
    const weight = num(iWeight === undefined ? undefined : row[iWeight]);
    if (weight !== null && weight !== 0) rowUnits.set(unit, (rowUnits.get(unit) ?? 0) + 1);
    const distanceUnit =
      headerDistanceUnit ??
      text(iDistanceUnit === undefined ? undefined : row[iDistanceUnit]) ??
      (unit === 'LB' ? 'mi' : 'km');
    pushSet(acc, ex, {
      kind,
      weightKg: toKg(weight, unit),
      reps: roundReps(positive(num(iReps === undefined ? undefined : row[iReps]))),
      distanceM: metresFrom(
        num(iDistance === undefined ? undefined : row[iDistance]),
        distanceUnit,
      ),
      durationSec: roundReps(positive(num(iSeconds === undefined ? undefined : row[iSeconds]))),
      rpe: rpeOf(num(iRpe === undefined ? undefined : row[iRpe])),
    });
  }
  const workouts = acc.result();
  if (workouts.length === 0) return { ok: false, reason: 'no_workouts', source: 'STRONG' };
  const weightUnit =
    fileUnit ?? ((rowUnits.get('LB') ?? 0) > (rowUnits.get('KG') ?? 0) ? 'LB' : 'KG');
  return {
    ok: true,
    import: { source: 'STRONG', weightUnit, workouts, skippedRows: acc.skippedRows },
  };
}

// ─── Hevy ────────────────────────────────────────────────────────────────────

function hevyKind(raw: string | undefined): ImportedSetKind {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'warmup') return 'warmup';
  if (s === 'dropset') return 'drop';
  if (s === 'failure') return 'failure';
  return 'normal';
}

function parseHevy(rows: string[][]): WorkoutCsvParseResult {
  const cols = columnsOf(rows[0] ?? []);
  const at = (row: string[], name: string) => {
    const i = cols.get(name);
    return i === undefined ? undefined : row[i];
  };
  const weightUnit: WeightUnit = cols.has('weight_lbs') ? 'LB' : 'KG';
  const weightCol = weightUnit === 'LB' ? 'weight_lbs' : 'weight_kg';
  const distanceCol = cols.has('distance_miles')
    ? { name: 'distance_miles', unit: 'mi' }
    : cols.has('distance_meters')
      ? { name: 'distance_meters', unit: 'm' }
      : { name: 'distance_km', unit: 'km' };

  const acc = new WorkoutAccumulator('HEVY');
  for (const row of rows.slice(1)) {
    const startRaw = at(row, 'start_time') ?? '';
    const start = parseImportDate(startRaw);
    const name = text(at(row, 'exercise_title'));
    if (!start || !name) {
      acc.skippedRows++;
      continue;
    }
    const title = text(at(row, 'title')) ?? 'Workout';
    const draft = acc.workout(`${startRaw}|${at(row, 'end_time') ?? ''}|${title}`, () => {
      const end = parseImportDate(at(row, 'end_time') ?? '');
      const seconds = end ? (end.minutes - start.minutes) * 60 : 0;
      return {
        title,
        localDate: start.localDate,
        localTime: start.localTime,
        durationSec: seconds > 0 && seconds <= MAX_DURATION_SEC ? seconds : null,
        notes: text(at(row, 'description')),
      };
    });
    const ex = acc.exercise(draft, name);
    addNote(ex, text(at(row, 'exercise_notes')));
    pushSet(acc, ex, {
      kind: hevyKind(at(row, 'set_type')),
      weightKg: toKg(num(at(row, weightCol)), weightUnit),
      reps: roundReps(positive(num(at(row, 'reps')))),
      distanceM: metresFrom(num(at(row, distanceCol.name)), distanceCol.unit),
      durationSec: roundReps(positive(num(at(row, 'duration_seconds')))),
      rpe: rpeOf(num(at(row, 'rpe'))),
    });
  }
  const workouts = acc.result();
  if (workouts.length === 0) return { ok: false, reason: 'no_workouts', source: 'HEVY' };
  return {
    ok: true,
    import: { source: 'HEVY', weightUnit, workouts, skippedRows: acc.skippedRows },
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Which app wrote this header row, if either. */
export function detectWorkoutCsvSource(header: readonly string[]): WorkoutImportSource | null {
  const cols = new Set(header.map((h) => h.trim().toLowerCase()));
  if (cols.has('exercise_title') && cols.has('start_time')) return 'HEVY';
  if (cols.has('exercise name') && cols.has('set order')) return 'STRONG';
  return null;
}

/**
 * Parses a Strong or Hevy workout export. `weightUnit` is only consulted for
 * an older Strong file whose weights carry no unit (`needs_unit` otherwise).
 */
export function parseWorkoutCsv(
  csv: string,
  options: { weightUnit?: WeightUnit | undefined } = {},
): WorkoutCsvParseResult {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, reason: 'empty', source: null };
  const source = detectWorkoutCsvSource(rows[0] ?? []);
  if (source === 'HEVY') return parseHevy(rows);
  if (source === 'STRONG') return parseStrong(rows, options.weightUnit);
  return { ok: false, reason: 'unknown_format', source: null };
}
