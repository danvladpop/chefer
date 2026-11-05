import type {
  ExerciseEquipment,
  ImportedExercise,
  Muscle,
  WorkoutImportExerciseRowDto,
  WorkoutImportMatchStatus,
} from '@chefer/types';

// ─── Matching Strong / Hevy exercise names to Chefer's library (G2) ───────────
// Both apps write "<movement> (<equipment>)": "Bench Press (Barbell)",
// "Lat Pulldown - Wide Grip (Cable)", "Pull Up (Assisted)". Chefer's catalog
// names put the equipment first ("Dumbbell Curl") and carry aliases. In order:
//   1. the user's own custom exercise of the same name (a previous import);
//   2. IMPORT_NAME_ALIASES — common names that no rule maps well;
//   3. exact keys: "<equipment> <movement>", "<grip> <movement>", "<movement>"
//      (the last only when the equipment agrees);
//   4. otherwise a fuzzy word-overlap guess — `suggested`, never `matched`, so
//      the review screen asks.

export interface ImportLibraryExercise {
  id: string;
  name: string;
  aliases: readonly string[];
  equipment: ExerciseEquipment;
  primaryMuscles: readonly Muscle[];
  /** The user's own custom exercise (curated rows are false). */
  custom: boolean;
}

export interface ImportNameMatch {
  status: WorkoutImportMatchStatus;
  exerciseId: string | null;
  /** Other plausible exercises, best first (never the match itself). */
  alternatives: string[];
}

/** Common Strong / Hevy names → catalog slug, where the rules below would miss or pick wrong. */
const IMPORT_NAME_ALIASES: Record<string, string> = {
  'Incline Bench Press (Dumbbell)': 'incline-dumbbell-press',
  'Incline Bench Press (Smith Machine)': 'smith-machine-incline-press',
  'Bench Press - Close Grip (Barbell)': 'close-grip-bench-press',
  'Chest Fly (Dumbbell)': 'dumbbell-fly',
  'Chest Fly (Machine)': 'pec-deck',
  'Butterfly (Pec Deck)': 'pec-deck',
  'Cable Fly Crossovers': 'cable-crossover',
  'Chest Press (Machine)': 'machine-chest-press',
  'Lat Pulldown (Machine)': 'lat-pulldown',
  'Lat Pulldown - Wide Grip (Cable)': 'lat-pulldown',
  'Seated Row (Cable)': 'seated-cable-row',
  'Seated Cable Row - V Grip (Cable)': 'seated-cable-row',
  'Seated Cable Row - Bar Grip': 'seated-cable-row',
  'Dumbbell Row': 'single-arm-dumbbell-row',
  'Bent Over Row (Dumbbell)': 'bent-over-dumbbell-row',
  'Chin Up (Assisted)': 'assisted-pull-up',
  'Bicep Curl (Barbell)': 'barbell-curl',
  'Bicep Curl (Dumbbell)': 'dumbbell-curl',
  'Bicep Curl (Cable)': 'cable-biceps-curl',
  'Bicep Curl (Machine)': 'machine-biceps-curl',
  'EZ Bar Biceps Curl': 'ez-bar-curl',
  'Preacher Curl (Barbell)': 'preacher-curl',
  'Preacher Curl (Dumbbell)': 'dumbbell-preacher-curl',
  'Triceps Pushdown (Cable - Straight Bar)': 'triceps-pushdown',
  'Triceps Rope Pushdown': 'rope-triceps-pushdown',
  'Triceps Pushdown (Cable - Rope)': 'rope-triceps-pushdown',
  'Triceps Dip (Assisted)': 'assisted-dip',
  'Skullcrusher (Barbell)': 'skull-crusher',
  'Skullcrusher (Dumbbell)': 'dumbbell-skull-crusher',
  'Triceps Extension (Dumbbell)': 'dumbbell-overhead-triceps-extension',
  'Triceps Kickback (Dumbbell)': 'dumbbell-triceps-kickback',
  'Shoulder Press (Dumbbell)': 'seated-dumbbell-shoulder-press',
  'Seated Shoulder Press (Machine)': 'machine-shoulder-press',
  'Shoulder Press (Machine)': 'machine-shoulder-press',
  'Overhead Press (Dumbbell)': 'standing-dumbbell-shoulder-press',
  'Single Arm Lateral Raise (Cable)': 'cable-lateral-raise',
  'Rear Delt Fly (Dumbbell)': 'dumbbell-reverse-fly',
  'Reverse Fly (Machine)': 'reverse-pec-deck',
  "Knee Raise (Captain's Chair)": 'captains-chair-knee-raise',
  'Leg Press Horizontal (Machine)': 'leg-press',
  'Hip Thrust (Machine)': 'hip-thrust',
  'Calf Raise (Machine)': 'standing-calf-raise',
  'Standing Calf Raise (Machine)': 'standing-calf-raise',
  'Standing Calf Raise (Dumbbell)': 'dumbbell-calf-raise',
  'Lunge (Dumbbell)': 'walking-lunge',
  'Glute Kickback (Machine)': 'glute-kickback-machine',
  'Sit Up': 'crunch',
  // From a sweep of 33 real exports (G2): frequent names with a catalog twin.
  'Incline Row (Dumbbell)': 'incline-dumbbell-row',
  'Chest Supported Incline Row (Dumbbell)': 'incline-dumbbell-row',
  'Chest Supported Machine Row': 'chest-supported-row',
  'Bent Over One Arm Row (Dumbbell)': 'single-arm-dumbbell-row',
  'Seated Row (Machine)': 'machine-row',
  'Seated Incline Curl (Dumbbell)': 'incline-dumbbell-curl',
  'Seated Palms Up Wrist Curl': 'barbell-wrist-curl',
  'Rear Delt Reverse Fly (Machine)': 'reverse-pec-deck',
  'Rear Delt Reverse Fly (Cable)': 'cable-rear-delt-fly',
  'Rear Delt Reverse Fly (Dumbbell)': 'dumbbell-reverse-fly',
  'Standing Calf Raise (Smith)': 'standing-calf-raise',
  'Seated Overhead Press (Dumbbell)': 'seated-dumbbell-shoulder-press',
  'Seated Overhead Press (Barbell)': 'overhead-press',
  'Strict Military Press (Barbell)': 'overhead-press',
  Spinning: 'spin-class',
  Cycling: 'outdoor-cycle',
  'Cycling (Indoor)': 'stationary-bike-upright',
  'Rowing (Machine)': 'rowing-machine',
  'Elliptical Trainer': 'elliptical',
  'Stair Machine': 'stair-climber',
  'Stair Machine (Floors)': 'stair-climber',
  'Treadmill Walk': 'treadmill-walk',
  'Running (Treadmill)': 'treadmill-run',
};

/** Equipment words as both apps write them in the parentheses. */
const EQUIPMENT_BY_SUFFIX: Record<string, ExerciseEquipment> = {
  barbell: 'BARBELL',
  'trap bar': 'BARBELL',
  dumbbell: 'DUMBBELL',
  machine: 'MACHINE',
  'plate loaded': 'MACHINE',
  'machine plates': 'MACHINE',
  'pec deck': 'MACHINE',
  cable: 'CABLE',
  'smith machine': 'SMITH',
  smith: 'SMITH',
  kettlebell: 'KETTLEBELL',
  band: 'BAND',
  bodyweight: 'BODYWEIGHT',
  weighted: 'BODYWEIGHT',
  suspension: 'BODYWEIGHT',
  'captains chair': 'BODYWEIGHT',
  assisted: 'ASSISTED',
  'ez bar': 'EZ_BAR',
};

const WORD_FIXES: Record<string, string> = {
  bicep: 'biceps',
  tricep: 'triceps',
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  pullup: 'pull up',
  pullups: 'pull up',
  chinup: 'chin up',
  chinups: 'chin up',
  pushup: 'push up',
  pushups: 'push up',
  skullcrusher: 'skull crusher',
  skullcrushers: 'skull crusher',
  situp: 'sit up',
  flye: 'fly',
  flyes: 'fly',
  flys: 'fly',
  presses: 'press',
  crunches: 'crunch',
  pushdowns: 'pushdown',
  pulldowns: 'pulldown',
};

/** Lower-case words only: "Pull-Up" and "pull up" are the same key. */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(
      (w) =>
        WORD_FIXES[w] ??
        (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w),
    )
    .join(' ');
}

type ParsedName = { main: string; variant: string | null; suffix: string | null };

/** "Lat Pulldown - Wide Grip (Cable)" → main "lat pulldown", variant "wide grip", suffix "cable". */
function splitName(raw: string): ParsedName {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw.trim());
  const base = m?.[1] ?? raw;
  const suffix = m ? normalizeExerciseName(m[2] ?? '') : null;
  const [main, ...rest] = base.split(/\s+-\s+/);
  return {
    main: normalizeExerciseName(main ?? base),
    variant: rest.length > 0 ? normalizeExerciseName(rest.join(' ')) : null,
    suffix: suffix === '' ? null : suffix,
  };
}

/** The suffix's equipment — "cable straight bar" is still a cable. */
function equipmentOf(suffix: string | null): ExerciseEquipment | null {
  if (!suffix) return null;
  const exact = EQUIPMENT_BY_SUFFIX[suffix];
  if (exact) return exact;
  const first = Object.entries(EQUIPMENT_BY_SUFFIX).find(([k]) => suffix.startsWith(k));
  return first ? first[1] : null;
}

/** The equipment a Strong / Hevy name states in its parentheses, if any. */
export function importedExerciseEquipment(rawName: string): ExerciseEquipment | null {
  return equipmentOf(splitName(rawName).suffix);
}

function compatible(file: ExerciseEquipment | null, entry: ExerciseEquipment): boolean {
  if (file === null || file === entry) return true;
  return (file === 'BARBELL' && entry === 'EZ_BAR') || (file === 'EZ_BAR' && entry === 'BARBELL');
}

const ALIAS_BY_KEY = new Map(
  Object.entries(IMPORT_NAME_ALIASES).map(([name, id]) => [normalizeExerciseName(name), id]),
);

export class ImportExerciseMatcher {
  private readonly byKey = new Map<string, ImportLibraryExercise[]>();
  private readonly byId: Map<string, ImportLibraryExercise>;

  constructor(private readonly library: readonly ImportLibraryExercise[]) {
    this.byId = new Map(library.map((e) => [e.id, e]));
    for (const e of library) {
      for (const key of new Set([e.name, ...e.aliases].map(normalizeExerciseName))) {
        const list = this.byKey.get(key) ?? [];
        list.push(e);
        this.byKey.set(key, list);
      }
    }
  }

  exercise(id: string): ImportLibraryExercise | undefined {
    return this.byId.get(id);
  }

  match(rawName: string): ImportNameMatch {
    const whole = normalizeExerciseName(rawName);
    const exact = (id: string): ImportNameMatch => ({
      status: 'matched',
      exerciseId: id,
      alternatives: this.fuzzy(rawName, id).map((f) => f.id),
    });

    const own = this.library.find((e) => e.custom && normalizeExerciseName(e.name) === whole);
    if (own) return exact(own.id);
    const aliased = ALIAS_BY_KEY.get(whole);
    if (aliased && this.byId.has(aliased)) return exact(aliased);

    const { main, variant, suffix } = splitName(rawName);
    const equipment = equipmentOf(suffix);
    const keys: { key: string; checkEquipment: boolean }[] = [
      { key: whole, checkEquipment: false },
      ...(suffix
        ? [{ key: `${suffix} ${variant ? `${variant} ` : ''}${main}`, checkEquipment: false }]
        : []),
      ...(suffix ? [{ key: `${suffix} ${main}`, checkEquipment: false }] : []),
      ...(variant ? [{ key: `${variant} ${main}`, checkEquipment: true }] : []),
      ...(variant ? [{ key: `${main} ${variant}`, checkEquipment: true }] : []),
      { key: main, checkEquipment: true },
    ];
    for (const { key, checkEquipment } of keys) {
      const hits = (this.byKey.get(key) ?? []).filter(
        (e) => !checkEquipment || compatible(equipment, e.equipment),
      );
      const hit =
        hits.find((e) => equipment === null || compatible(equipment, e.equipment)) ?? hits[0];
      if (hit) return exact(hit.id);
    }

    const guesses = this.fuzzy(rawName, null);
    const best = guesses[0];
    if (best && best.score >= 0.5) {
      return {
        status: 'suggested',
        exerciseId: best.id,
        alternatives: guesses.slice(1).map((g) => g.id),
      };
    }
    return { status: 'unmatched', exerciseId: null, alternatives: guesses.map((g) => g.id) };
  }

  /** Word-overlap (Jaccard) over every name and alias, equipment-aware; best 3. */
  private fuzzy(rawName: string, exclude: string | null): { id: string; score: number }[] {
    const { main, variant, suffix } = splitName(rawName);
    const equipment = equipmentOf(suffix);
    const words = new Set(`${suffix ?? ''} ${variant ?? ''} ${main}`.trim().split(/\s+/));
    const scored = new Map<string, number>();
    for (const [key, entries] of this.byKey) {
      const other = new Set(key.split(' '));
      let shared = 0;
      for (const w of words) if (other.has(w)) shared++;
      if (shared === 0) continue;
      const jaccard = shared / (words.size + other.size - shared);
      for (const e of entries) {
        if (e.id === exclude) continue;
        const score = compatible(equipment, e.equipment) ? jaccard : jaccard * 0.6;
        if (score > (scored.get(e.id) ?? 0)) scored.set(e.id, score);
      }
    }
    return [...scored.entries()]
      .filter(([, score]) => score >= 0.3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([id, score]) => ({ id, score }));
  }
}

// ─── The review rows ─────────────────────────────────────────────────────────

const MUSCLE_KEYWORDS: [RegExp, Muscle][] = [
  [/calf|calves/, 'calves'],
  [/shrug/, 'traps'],
  [/back extension|hyperextension|good morning/, 'lower-back'],
  [/abduct/, 'abductors'],
  [/adduct/, 'adductors'],
  [/wrist|grip|forearm|farmer/, 'forearms'],
  [/crunch|plank|sit up|leg raise|knee raise|ab |abs|rollout|hollow|dead bug|v up/, 'abs'],
  [/triceps|pushdown|skull|dip/, 'triceps'],
  [/hip thrust|glute|kickback|bridge/, 'glutes'],
  [/deadlift|rdl|leg curl|hamstring|nordic/, 'hamstrings'],
  [/squat|leg press|lunge|leg extension|step up|split squat/, 'quads'],
  [/curl/, 'biceps'],
  [/face pull|rear delt|reverse fly/, 'rear-delts'],
  [/lateral raise|upright row/, 'side-delts'],
  [/overhead press|shoulder press|military|arnold|front raise/, 'front-delts'],
  [/pulldown|pull up|chin up|pullover/, 'lats'],
  [/row/, 'upper-back'],
  [/bench|chest|fly|push up|pec|press/, 'chest'],
];

function guessMuscle(name: string, alternative: ImportLibraryExercise | undefined): Muscle {
  const n = ` ${normalizeExerciseName(name)} `;
  return (
    MUSCLE_KEYWORDS.find(([re]) => re.test(n))?.[1] ?? alternative?.primaryMuscles[0] ?? 'quads'
  );
}

/** What the file's sets look like for one exercise name. */
export function importedExerciseKind(
  sets: readonly ImportedExercise['sets'][number][],
): WorkoutImportExerciseRowDto['kind'] {
  if (sets.some((s) => s.distanceM !== null)) return 'cardio';
  const weighted = sets.some((s) => s.weightKg > 0);
  if (weighted) return 'strength';
  if (sets.some((s) => s.reps !== null && s.reps > 0)) return 'bodyweight';
  return sets.some((s) => s.durationSec !== null) ? 'timed' : 'bodyweight';
}

/** One review row per distinct exercise name in the file, most-used first. */
export function importReviewRows(
  workouts: readonly { exercises: readonly ImportedExercise[] }[],
  matcher: ImportExerciseMatcher,
): WorkoutImportExerciseRowDto[] {
  const byName = new Map<string, { sets: ImportedExercise['sets'][number][]; workouts: number }>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      const entry = byName.get(e.name) ?? { sets: [], workouts: 0 };
      entry.sets.push(...e.sets);
      entry.workouts++;
      byName.set(e.name, entry);
    }
  }
  return [...byName.entries()]
    .map(([name, { sets, workouts }]) => {
      const m = matcher.match(name);
      const target = m.exerciseId ? matcher.exercise(m.exerciseId) : undefined;
      const alternatives = m.alternatives
        .map((id) => matcher.exercise(id))
        .filter((e): e is ImportLibraryExercise => e !== undefined);
      return {
        name,
        sets: sets.length,
        workouts,
        kind: importedExerciseKind(sets),
        status: m.status,
        exerciseId: target?.id ?? null,
        exerciseName: target?.name ?? null,
        alternatives: alternatives.map((e) => ({ id: e.id, name: e.name })),
        suggestedMuscle: guessMuscle(name, target ?? alternatives[0]),
      };
    })
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}
