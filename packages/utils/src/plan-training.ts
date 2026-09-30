import type {
  DayKind,
  NutritionTargets,
  PlanTrainingBasis,
  PlanTrainingDay,
  WeekGlanceDay,
} from '@chefer/types';
import {
  hasTrainingDayBump,
  isRunKind,
  trainingDayBonus,
  type ResolvedTrainingDay,
} from './training-nutrition';

// ─── Training days in the plan (UX-06, T-06.2 / T-06.4 / T-06.10) ─────────────
// Pure builders + copy shared by the API (`mealPlan.getForWeek.trainingDays`,
// `dashboard.summary.weekGlance`) and both clients (plan markers, the day
// header and its Explain sheet, Today's week glance). No I/O.

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** "Wednesday" for 0 = Monday … 6 = Sunday. */
export function weekdayLongName(dayOfWeek: number): string {
  return WEEKDAY_LONG[dayOfWeek] ?? String(dayOfWeek);
}

/** "Wed". */
export function weekdayShortName(dayOfWeek: number): string {
  return WEEKDAY_SHORT[dayOfWeek] ?? String(dayOfWeek);
}

/** ["Mon", "Wed", "Fri"] → "Mon, Wed and Fri". */
export function joinDayNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Evening-before carb snack ideas for a long run — engineering placeholders (Q-3). */
export const PRE_RUN_SNACK_IDEAS: readonly string[] = [
  'a banana on toast with honey',
  'a bowl of porridge with a banana',
  'rice cakes with jam',
];

/** The pre-run snack idea shown on the evening before a long run. */
export function preRunSnackIdea(): string {
  return PRE_RUN_SNACK_IDEAS[0] ?? 'a banana on toast';
}

/** "Long run tomorrow: a carb snack tonight helps. For example, a banana on toast with honey." */
export function preRunNote(snack: string = preRunSnackIdea()): string {
  return `Long run tomorrow. A carb snack tonight helps: for example, ${snack}.`;
}

/**
 * The plan week's training days. `days` carries one resolved day per plan
 * weekday (only training days are kept); `base` is the REST-day target; the
 * bump is computed per kind and gated by goal (`hasTrainingDayBump`) — a day
 * whose kind the goal does not get keeps its marker but zero numbers (so a
 * non-goal user sees no kcal). `access` = the viewer's tier/flag gets the
 * bump applied; without it the numbers are a preview and `applied` is false.
 */
export function buildPlanTrainingDays(input: {
  days: readonly { dayOfWeek: number; resolved: ResolvedTrainingDay }[];
  base: NutritionTargets;
  bodyweightKg: number | null;
  goal: string | null;
  /** `trainingBumpFree` (D-2). Since Q-3 (2026-09-30) it no longer widens who gets a bump. */
  widened: boolean;
  /** Whether the lifter rules apply (set-up gym profile + bodyweight + goal rule). */
  lifter: boolean;
  access: boolean;
}): PlanTrainingDay[] {
  const out: PlanTrainingDay[] = [];
  for (const { dayOfWeek, resolved } of input.days) {
    if (!resolved.isTrainingDay || !resolved.kind) continue;
    const kind = resolved.kind;
    const allowed =
      hasTrainingDayBump(input.goal, kind, input.widened) && (kind !== 'lift' || input.lifter);
    const bonus = allowed
      ? trainingDayBonus(input.base.dailyCalorieTarget, input.bodyweightKg ?? 0, kind)
      : { kcalBonus: 0, proteinBonus: 0, carbsBonus: 0 };
    const applied = allowed && input.access;
    out.push({
      dayOfWeek,
      dayName: weekdayLongName(dayOfWeek),
      kind,
      workoutName: resolved.workoutName,
      kcalBonus: bonus.kcalBonus,
      proteinBonus: bonus.proteinBonus,
      carbsBonus: bonus.carbsBonus,
      done: resolved.reason === 'COMPLETED',
      applied,
      ...(applied && {
        targetKcal: input.base.dailyCalorieTarget + bonus.kcalBonus,
        targetProteinG: input.base.proteinG + bonus.proteinBonus,
      }),
      ...(kind === 'long_run' && { preRunSnack: preRunSnackIdea() }),
    });
  }
  return out.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/** The week's 7 glance columns from per-day meal counts and the training days. */
export function buildWeekGlance(input: {
  mealsByDay: ReadonlyMap<number, number>;
  training: readonly PlanTrainingDay[];
}): WeekGlanceDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const t = input.training.find((d) => d.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      meals: input.mealsByDay.get(dayOfWeek) ?? 0,
      ...(t && {
        training: {
          kind: t.kind,
          status: t.done ? ('done' as const) : ('planned' as const),
          workoutName: t.workoutName,
        },
      }),
    };
  });
}

/** "3 training days" — the week-summary chip. Null when there are none. */
export function trainingDaysChip(count: number): string | null {
  if (count <= 0) return null;
  return `${count} training day${count === 1 ? '' : 's'}`;
}

/** Which Ionicons glyph marks a day of this kind: barbell for lifting, walk for runs. */
export function trainingGlyph(kind: DayKind): 'barbell-outline' | 'walk-outline' {
  return isRunKind(kind) ? 'walk-outline' : 'barbell-outline';
}

const KIND_LABEL: Record<DayKind, string> = {
  lift: 'Training day',
  run: 'Run day',
  long_run: 'Long run day',
  rest: 'Rest day',
};

/** "Long run day" / "Run day" / "Training day". */
export function trainingKindLabel(kind: DayKind): string {
  return KIND_LABEL[kind];
}

export interface TrainingDayHeaderCopy {
  /** "Training day · Upper A" or "Long run day · +450 kcal, mostly carbs". */
  title: string;
  /** "Target today 2,540 kcal · 165 g protein" — only when the bump is applied. */
  targetLine: string | null;
  /** "(+300 kcal, +31 g protein for training)" — lift days, applied only. */
  bonusLine: string | null;
  /** One string for the header button: title, target and "Explains why". */
  a11yLabel: string;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/**
 * The plan's training-day header for one day. Non-goal users (bump zero, or
 * not applied to their tier) get the title only — no kcal is shown unless
 * the number is what the day's target actually is.
 */
export function trainingDayHeaderCopy(
  day: PlanTrainingDay,
  opts: { isToday?: boolean } = {},
): TrainingDayHeaderCopy {
  const showsNumbers = day.applied && day.kcalBonus > 0;
  let title: string;
  if (isRunKind(day.kind)) {
    title = showsNumbers
      ? `${trainingKindLabel(day.kind)} · +${fmt(day.kcalBonus)} kcal, mostly carbs`
      : `${trainingKindLabel(day.kind)} · ${day.dayName}`;
  } else {
    title = `Training day · ${day.workoutName ?? day.dayName}`;
  }
  const when = opts.isToday === false ? 'this day' : 'today';
  const targetLine =
    showsNumbers && day.targetKcal !== undefined
      ? `Target ${when} ${fmt(day.targetKcal)} kcal${
          day.targetProteinG !== undefined ? ` · ${day.targetProteinG} g protein` : ''
        }`
      : null;
  const bonusLine =
    showsNumbers && day.kind === 'lift'
      ? `(+${fmt(day.kcalBonus)} kcal, +${day.proteinBonus} g protein for training)`
      : null;
  const spokenTarget =
    showsNumbers && day.targetKcal !== undefined
      ? ` Target ${when} ${fmt(day.targetKcal)} kilocalories${
          day.targetProteinG !== undefined ? `, ${day.targetProteinG} grams of protein` : ''
        }.`
      : '';
  const spokenTitle = isRunKind(day.kind)
    ? `${trainingKindLabel(day.kind)}, ${day.dayName}`
    : `Training day, ${day.workoutName ?? day.dayName}`;
  return {
    title,
    targetLine,
    bonusLine,
    a11yLabel: `${spokenTitle}.${spokenTarget} Explains why.`,
  };
}

/** `Wednesday, training day` / `Saturday, long run day` — the day chip's a11y label. */
export function trainingChipA11y(dayName: string, kind: DayKind): string {
  return `${dayName}, ${trainingKindLabel(kind).toLowerCase()}`;
}

export interface TrainingExplainCopy {
  eyebrow: string;
  title: string;
  sentence: string;
  rows: { label: string; value: string }[];
  footnote: string;
  actionLabel: string;
}

/**
 * The Explain sheet behind the training-day header and Today's `Why?` link
 * (PAT-1). Quotes the rest-day target, each kind's bonus and the protein
 * basis; with `applied` false (free without the flag) the sentence says what
 * Premium adds instead of claiming the bump was made.
 */
export function trainingExplainCopy(input: {
  days: readonly PlanTrainingDay[];
  basis: PlanTrainingBasis | null;
}): TrainingExplainCopy {
  const { days, basis } = input;
  const byKind = (kind: DayKind) => days.filter((d) => d.kind === kind);
  const lifts = byKind('lift');
  const runs = byKind('run');
  const longRuns = byKind('long_run');
  const applied = days.some((d) => d.applied);
  const verb = applied ? 'Chefer adds' : 'Premium adds';
  const names = (list: readonly PlanTrainingDay[]) =>
    joinDayNames(list.map((d) => weekdayShortName(d.dayOfWeek)));

  const parts: string[] = [];
  const rows: { label: string; value: string }[] = [];
  if (basis) {
    rows.push({
      label: 'Rest-day target',
      value: `${fmt(basis.restKcal)} kcal · ${basis.restProteinG} g protein`,
    });
  }
  const first = (list: readonly PlanTrainingDay[]) => list[0];
  const liftFirst = first(lifts);
  if (lifts.length > 0 && liftFirst) {
    parts.push(
      liftFirst.kcalBonus > 0
        ? `You train on ${names(lifts)}. On those days ${verb} about ${fmt(liftFirst.kcalBonus)} kcal and ${liftFirst.proteinBonus} g of protein, mostly around your workout, to help you recover and build muscle.`
        : `You train on ${names(lifts)}.`,
    );
    if (liftFirst.kcalBonus > 0) {
      rows.push({
        label: 'Training bonus',
        value: `+${fmt(liftFirst.kcalBonus)} kcal, +${liftFirst.proteinBonus} g protein`,
      });
    }
  }
  const runFirst = first(runs);
  if (runs.length > 0 && runFirst) {
    parts.push(
      runFirst.kcalBonus > 0
        ? `You run on ${names(runs)}. ${verb} about ${fmt(runFirst.kcalBonus)} kcal on those days, mostly carbs, to fuel the run.`
        : `You run on ${names(runs)}.`,
    );
    if (runFirst.kcalBonus > 0) {
      rows.push({
        label: 'Run day bonus',
        value: `+${fmt(runFirst.kcalBonus)} kcal, mostly carbs`,
      });
    }
  }
  const longFirst = first(longRuns);
  if (longRuns.length > 0 && longFirst) {
    parts.push(
      longFirst.kcalBonus > 0
        ? `Your long run is on ${names(longRuns)}. ${verb} about ${fmt(longFirst.kcalBonus)} kcal that day, mostly carbs, and suggests a carb snack the evening before.`
        : `Your long run is on ${names(longRuns)}.`,
    );
    if (longFirst.kcalBonus > 0) {
      rows.push({
        label: 'Long run bonus',
        value: `+${fmt(longFirst.kcalBonus)} kcal, mostly carbs`,
      });
    }
  }
  if (basis?.proteinGPerKg != null && lifts.length > 0) {
    rows.push({
      label: `Protein basis (${basis.proteinGPerKg} g per kg, because you train)`,
      value: basis.bodyweightKg != null ? `${basis.bodyweightKg} kg` : '',
    });
  }
  return {
    eyebrow: 'Why this target',
    // Q-3 (owner, 2026-09-30): run days never raise targets, so only a week
    // with a real bonus may promise more food.
    title: days.some((d) => d.kcalBonus > 0) ? 'More food on training days' : 'Your training days',
    sentence: parts.join(' '),
    rows,
    footnote: 'Change your training days in Gym settings.',
    actionLabel: 'Change training days',
  };
}

// ─── What Premium changed (UX-10 §8, T-10.7) ──────────────────────────────────

export interface PremiumChangesResult {
  lines: string[];
  targetHits: number;
  missDays: number;
  /** Days outside the band, with how far off (negative = under target). */
  misses: { dayOfWeek: number; deltaKcal: number }[];
}

/**
 * The one-time `What Premium changed` lines for a premium regeneration —
 * honest by construction: only what this generation did (lift days it was
 * built around, higher run-day targets that apply, leftovers, kept
 * favourites) plus the day-vs-target check, a miss stated rather than hidden.
 */
export function buildPremiumChanges(input: {
  /** Planned days only, with their portion-aware kcal total. */
  days: readonly { dayOfWeek: number; kcal: number }[];
  targetFor: (dayOfWeek: number) => number;
  /** The rest-day target, for the `Meets your … target` line. */
  baseKcal: number;
  trainingDays: readonly PlanTrainingDay[];
  /** The week was built around the routine's lift days. */
  fitLift: boolean;
  leftovers: boolean;
  pinCount: number;
  /** ± band around the target that counts as a hit (0.15 = 15 %). */
  tolerance: number;
}): PremiumChangesResult {
  const short = (list: readonly PlanTrainingDay[]) =>
    joinDayNames(list.map((d) => weekdayShortName(d.dayOfWeek)));
  const lines: string[] = [];
  const lifts = input.trainingDays.filter((d) => d.kind === 'lift');
  if (input.fitLift && lifts.length > 0) {
    lines.push(`Built around your lift day${lifts.length === 1 ? '' : 's'} (${short(lifts)})`);
  }
  const runs = input.trainingDays.filter((d) => d.kind === 'run' && d.applied && d.kcalBonus > 0);
  const longRuns = input.trainingDays.filter(
    (d) => d.kind === 'long_run' && d.applied && d.kcalBonus > 0,
  );
  if (runs.length + longRuns.length > 0) {
    const parts = [
      ...(runs.length > 0 ? [`run day${runs.length === 1 ? '' : 's'} (${short(runs)})`] : []),
      ...(longRuns.length > 0
        ? [`long run${longRuns.length === 1 ? '' : 's'} (${short(longRuns)})`]
        : []),
    ];
    lines.push(`Higher targets, mostly carbs, on your ${parts.join(' and ')}`);
  }
  if (input.leftovers) lines.push('Dinners are paired with next-day lunches so you cook less');
  if (input.pinCount > 0) {
    lines.push(
      `${input.pinCount} of your favourite${input.pinCount === 1 ? '' : 's'} made it into the week`,
    );
  }
  const misses: { dayOfWeek: number; deltaKcal: number }[] = [];
  let hits = 0;
  for (const d of input.days) {
    const target = input.targetFor(d.dayOfWeek);
    if (target <= 0) continue;
    if (Math.abs(d.kcal - target) / target <= input.tolerance) hits++;
    else misses.push({ dayOfWeek: d.dayOfWeek, deltaKcal: Math.round(d.kcal - target) });
  }
  lines.push(
    `Meets your ${fmt(input.baseKcal)} kcal target on ${hits} of ${input.days.length} days`,
  );
  return { lines, targetHits: hits, missDays: input.days.length - hits, misses };
}
