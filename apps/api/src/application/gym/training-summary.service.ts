import {
  ExerciseTrackingType,
  type ActivePauseDto,
  type ExerciseMeta,
  type GymBootstrap,
  type NextWorkoutExerciseDto,
  type PrDto,
  type RoutineExerciseDto,
  type SessionSummaryDto,
  type WeightUnit,
} from '@chefer/types';
import {
  activityFacts,
  formatDurationMinutes,
  formatLoad,
  isActivityLogSession,
  pauseReasonLabel,
  sessionDurationMin,
  trackingTypeOf,
  weekdayDateLabel,
} from '@chefer/utils';
import { gymBootstrapService, type GymBootstrapService } from './gym-bootstrap.service.js';
import { gymProfileService, type GymProfileService } from './gym-profile.service.js';
import { gymStatsService, type GymStatsService } from './gym-stats.service.js';

// ─── Training summary for Ask Chef (chat tool `getMyTraining`, 2026-10-10) ────
// A short, plain-text read of the user's REAL gym data for the chat model:
// whether training is set up, this week vs the weekly goal, the streak, the
// next workout, the active routine, the last few sessions, recent PRs, a
// training pause and the rule-based program recommendation. Read-only — the
// chef never edits routines; it explains how (Train → Routines → Edit).
// Everything comes from the same services the Train tab reads (bootstrap,
// PR timeline, setup recommendation), so the chef quotes what the app shows.

/** Sessions listed under "Last sessions". */
export const CHAT_TRAINING_RECENT_SESSIONS = 5;
/** PRs listed under "Recent PRs". */
export const CHAT_TRAINING_RECENT_PRS = 5;
/**
 * The gym API level the summary reads at. The level gates what a CLIENT can
 * render (cardio rows, INTERVALS); this is text for the model, which can
 * describe any entry, so it reads everything (the highest level, 5).
 */
const CHAT_TRAINING_LEVEL = 5;

export type ChatTrainingInput = {
  /** The user's local calendar day, YYYY-MM-DD (week boundaries, pauses). */
  today: string;
  /** Fallback unit before training is set up (`ChefProfile.preferredUnits`). */
  preferredUnits?: 'METRIC' | 'IMPERIAL' | null | undefined;
};

export class TrainingSummaryService {
  constructor(
    private readonly bootstrap: Pick<GymBootstrapService, 'get'> = gymBootstrapService,
    private readonly stats: Pick<GymStatsService, 'prs'> = gymStatsService,
    private readonly profiles: Pick<GymProfileService, 'recommend'> = gymProfileService,
  ) {}

  /** The `getMyTraining` tool result. */
  async forChat(userId: string, input: ChatTrainingInput): Promise<string> {
    const boot = await this.bootstrap.get(userId, { today: input.today }, CHAT_TRAINING_LEVEL);
    const setUp = isSetUp(boot);
    // First-ever sets are baselines, not records — ask for a few extra.
    const prs =
      boot.recentSessions.length > 0
        ? (await this.stats.prs(userId, undefined, CHAT_TRAINING_RECENT_PRS * 4)).filter(
            (p) => !p.isFirst,
          )
        : [];
    let recommendation: TrainingRecommendation | null = null;
    if (setUp && boot.profile) {
      try {
        const rec = this.profiles.recommend({
          days: Math.min(6, Math.max(2, boot.profile.weeklyGoal)),
          experience: boot.profile.experience,
          equipmentAccess: boot.profile.equipmentAccess,
        });
        recommendation = { key: rec.recommendedKey, name: rec.preview.name, reason: rec.reason };
      } catch {
        // The recommendation is a nice-to-have; the summary stands without it.
        recommendation = null;
      }
    }
    return formatTrainingSummary({
      boot,
      prs: prs.slice(0, CHAT_TRAINING_RECENT_PRS),
      recommendation,
      today: input.today,
      unit: boot.profile?.unit ?? (input.preferredUnits === 'IMPERIAL' ? 'LB' : 'KG'),
    });
  }
}

export type TrainingRecommendation = { key: string; name: string; reason: string };

/** Setup finished = a gym profile with `setupCompletedAt` (the Train tab's own gate). */
function isSetUp(boot: Pick<GymBootstrap, 'profile'>): boolean {
  return boot.profile !== null && boot.profile.setupCompletedAt !== null;
}

const HOW_TO_CHANGE =
  'To change the routine the user edits it in the app: Train → Routines → Edit (the chef cannot edit routines or log workouts from chat).';

/** Pure formatter behind `forChat` — every number comes from `boot` / `prs`. */
export function formatTrainingSummary(args: {
  boot: GymBootstrap;
  prs: readonly PrDto[];
  recommendation: TrainingRecommendation | null;
  today: string;
  unit: WeightUnit;
}): string {
  const { boot, prs, recommendation, today, unit } = args;
  const metas = new Map<string, ExerciseMeta>(boot.library.map((e) => [e.id, e]));
  const name = (id: string) => metas.get(id)?.name ?? humanize(id);
  const lines: string[] = [
    `TRAINING (real data from the Train tab — answer from this; today is ${today}; weights in ${unit === 'LB' ? 'lb' : 'kg'}):`,
  ];

  if (!isSetUp(boot)) {
    lines.push(
      'Training is NOT set up yet: no weekly goal, routine or next workout. The user can set it up in the Train tab (a few questions, then a program is suggested).',
    );
  } else if (boot.profile) {
    lines.push(
      `Set up: ${label(boot.profile.experience)}, ${label(boot.profile.equipmentAccess)}, weekly goal ${boot.profile.weeklyGoal} session(s).`,
    );
    lines.push(
      `This week: ${boot.streak.thisWeekSessions} of ${boot.streak.thisWeekGoal} session(s) done. Streak: ${weeks(boot.streak.current)} in a row meeting the goal (best ${weeks(boot.streak.best)}).`,
    );
  }

  lines.push(...pauseLines(boot.activePause, boot.upcomingPause ?? null));

  const next = boot.nextWorkout;
  if (next) {
    const notes = [
      `~${next.estimatedMin} min`,
      ...(next.isDeload ? ['deload (lighter) week'] : []),
    ];
    lines.push(`Next workout: ${next.dayName} (${notes.join(', ')}):`);
    for (const e of next.exercises) {
      lines.push(
        `  - ${name(e.exerciseId)}: ${nextPrescription(e, metas.get(e.exerciseId), unit)}`,
      );
    }
  } else if (isSetUp(boot)) {
    lines.push('Next workout: none scheduled (no active routine).');
  }

  const routine = boot.activeRoutine;
  if (routine && routine.days.length > 0) {
    const nextDay = routine.days.find((d) => d.id === routine.nextDayId)?.name;
    lines.push(
      `Active routine "${routine.name}" (${routine.days.length} day(s)${nextDay ? `, next up: ${nextDay}` : ''}):`,
    );
    for (const day of [...routine.days].sort((a, b) => a.position - b.position)) {
      const exercises = [...day.exercises]
        .sort((a, b) => a.position - b.position)
        .map((e) => `${name(e.exerciseId)} ${routinePrescription(e, metas.get(e.exerciseId))}`);
      lines.push(
        `  - ${day.name}: ${exercises.length > 0 ? exercises.join(', ') : 'no exercises'}`,
      );
    }
  }

  const prSessions = new Set(prs.map((p) => p.sessionId));
  const recent = boot.recentSessions.slice(0, CHAT_TRAINING_RECENT_SESSIONS);
  if (recent.length > 0) {
    lines.push('Last finished sessions (newest first):');
    for (const s of recent) {
      lines.push(`  - ${sessionLine(s, prSessions.has(s.id))}`);
    }
  } else {
    lines.push('No finished sessions in the last 12 weeks.');
  }

  if (prs.length > 0) {
    lines.push('Recent PRs (newest first):');
    for (const p of prs) {
      lines.push(
        `  - ${weekdayDateLabel(p.localDate)} ${name(p.exerciseId)}: ${prText(p, metas.get(p.exerciseId), unit)}`,
      );
    }
  }

  if (recommendation) {
    const current = routine?.templateKey === recommendation.key;
    lines.push(
      `Program the app recommends for their setup (rule-based, the same as Train setup): ${recommendation.name} — ${recommendation.reason}${current ? ' (this is already their program)' : ''}.`,
    );
  }
  lines.push(HOW_TO_CHANGE);
  return lines.join('\n');
}

// ─── Line builders ────────────────────────────────────────────────────────────

function pauseLines(active: ActivePauseDto | null, upcoming: ActivePauseDto | null): string[] {
  const out: string[] = [];
  const reason = (p: ActivePauseDto) => {
    const r = pauseReasonLabel(p.reason);
    return r ? ` (${r.toLowerCase()})` : '';
  };
  if (active) {
    out.push(
      `Training is PAUSED${reason(active)} from ${weekdayDateLabel(active.startDate)} to ${weekdayDateLabel(active.endDate)} — paused weeks never break the streak.`,
    );
  }
  if (upcoming) {
    out.push(
      `A pause is planned${reason(upcoming)} from ${weekdayDateLabel(upcoming.startDate)} to ${weekdayDateLabel(upcoming.endDate)}.`,
    );
  }
  return out;
}

function isCardio(meta: ExerciseMeta | undefined): boolean {
  if (!meta) return false;
  const type = trackingTypeOf(meta);
  return (
    type === ExerciseTrackingType.DURATION_DISTANCE ||
    type === ExerciseTrackingType.DISTANCE ||
    type === ExerciseTrackingType.INTERVALS
  );
}

function repRange(min: number, max: number, meta: ExerciseMeta | undefined): string {
  const unit = meta?.isTimed ? ' s' : '';
  return `${min === max ? min : `${min}–${max}`}${unit}`;
}

/** "Bench Press 3×6–10" in the routine list. */
function routinePrescription(e: RoutineExerciseDto, meta: ExerciseMeta | undefined): string {
  if (isCardio(meta)) return '(cardio)';
  return `${e.sets}×${repRange(e.repMin, e.repMax, meta)}`;
}

/** "3 × 6–10 at 62.5 kg" — the engine's suggestion when it has a load. */
function nextPrescription(
  e: NextWorkoutExerciseDto,
  meta: ExerciseMeta | undefined,
  unit: WeightUnit,
): string {
  if (isCardio(meta)) return 'cardio';
  const sets = e.suggestion.sets > 0 ? e.suggestion.sets : e.sets;
  const base = `${sets} × ${repRange(e.repMin, e.repMax, meta)}`;
  const load = loadText(e.suggestion.weightKg, unit, meta);
  const from = e.fromLastTime ? ' (carried over from last time)' : '';
  return `${base}${load ? ` at ${load}` : ' (load: pick a starting weight)'}${from}`;
}

function loadText(kg: number, unit: WeightUnit, meta: ExerciseMeta | undefined): string | null {
  const loadType = meta?.loadType ?? 'WEIGHTED';
  if (loadType === 'WEIGHTED' && kg <= 0) return null;
  return formatLoad(kg, unit, loadType, { each: meta?.perHand });
}

function sessionLine(s: SessionSummaryDto, hasPr: boolean): string {
  const activity = isActivityLogSession(s);
  const facts = activityFacts(s);
  const minutes =
    activity && facts.durationSec !== null
      ? formatDurationMinutes(facts.durationSec)
      : s.finishedAt
        ? `${sessionDurationMin(s)} min`
        : null;
  const workingSets = s.exercises
    .filter((e) => !e.skipped)
    .reduce((n, e) => n + e.sets.filter((set) => set.completed && !set.isWarmup).length, 0);
  const parts = [
    ...(minutes ? [minutes] : []),
    ...(activity ? ['logged activity'] : [`${workingSets} working set(s)`]),
    ...(facts.caloriesKcal !== null && facts.caloriesKcal > 0
      ? [`~${Math.round(facts.caloriesKcal)} kcal (user-logged)`]
      : []),
    ...(s.isDeload ? ['deload'] : []),
    ...(hasPr ? ['PR'] : []),
  ];
  return `${weekdayDateLabel(s.localDate)} ${s.name} — ${parts.join(', ')}`;
}

function prText(p: PrDto, meta: ExerciseMeta | undefined, unit: WeightUnit): string {
  const load = loadText(p.weightKg, unit, meta) ?? 'bodyweight';
  if (p.kind === 'e1rm' && p.e1rmKg !== null) {
    return `${load} × ${p.reps} (best estimated 1-rep max, ${formatLoad(p.e1rmKg, unit)})`;
  }
  return `${load} × ${p.reps} (${p.kind === 'reps' ? 'most reps at this weight' : 'heaviest weight'})`;
}

function weeks(n: number): string {
  return `${n} week${n === 1 ? '' : 's'}`;
}

/** "FULL_GYM" → "full gym", "BEGINNER" → "beginner". */
function label(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ');
}

/** "barbell-row" → "Barbell row" (an exercise the library no longer lists). */
function humanize(id: string): string {
  const text = id.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const trainingSummaryService = new TrainingSummaryService();
