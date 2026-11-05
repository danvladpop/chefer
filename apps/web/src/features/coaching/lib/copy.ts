import type { Translator } from '@chefer/i18n';
import {
  FALLBACK_TRAINER_NAME,
  type CheckInAnswers,
  type CheckInQuestion,
  type RoutineChange,
} from '@chefer/types';

// ─── Coaching lines in the UI language (Lane J phase 4) ───────────────────────
// The `t`-taking twins of `editorLabel`, `routineChangesLine`,
// `trainerNameOrFallback` and `checkInAnswersLine` in @chefer/types /
// @chefer/utils, which stay English for the API and older callers. The mobile
// app has the same helpers in apps/mobile/src/features/coaching/copy.ts.

type T = Translator['t'];

/** The trainer's display name, or "your trainer" in the UI language when the account is gone. */
export function trainerNameOrFallbackT(name: string | null | undefined, t: T): string {
  return name && name.trim() !== '' && name !== FALLBACK_TRAINER_NAME
    ? name
    : t('coaching.common.fallbackTrainer');
}

/** Who an edit stamp names: "Ana", "Ana (former trainer)", or "a former trainer". */
export function editorLabelT(stamp: { name: string; former?: boolean | undefined }, t: T): string {
  if (!stamp.former) {
    return stamp.name === FALLBACK_TRAINER_NAME ? t('coaching.common.fallbackTrainer') : stamp.name;
  }
  if (stamp.name === FALLBACK_TRAINER_NAME || stamp.name.trim() === '') {
    return t('coaching.common.formerTrainer');
  }
  return t('coaching.common.formerTrainerNamed', { name: stamp.name });
}

/** One change in plain words: "+ Romanian deadlift", "Squat 3×8 → 4×6", "note on Bench press". */
export function routineChangeTextT(change: RoutineChange, t: T): string {
  switch (change.kind) {
    case 'added':
      return t('coaching.changes.added', { exercise: change.exercise });
    case 'removed':
      return t('coaching.changes.removed', { exercise: change.exercise });
    case 'changed':
      return t('coaching.changes.changed', {
        exercise: change.exercise,
        from: change.from,
        to: change.to,
      });
    case 'note':
      return t('coaching.changes.note', { exercise: change.exercise });
    case 'schedule':
      return t('coaching.changes.schedule');
    case 'created':
      return t('coaching.changes.created');
  }
}

/** The whole card line: "+ Romanian deadlift · Squat 3×8 → 4×6 · + 2 more". */
export function routineChangesLineT(changes: readonly RoutineChange[], t: T, max = 4): string {
  const shown = changes.slice(0, max).map((c) => routineChangeTextT(c, t));
  const more = changes.length - shown.length;
  return [...shown, ...(more > 0 ? [t('coaching.changes.more', { count: more })] : [])].join(' · ');
}

/** A check-in question's label ("Energy"). */
export function checkInQuestionLabelT(question: CheckInQuestion, t: T): string {
  return t(`coaching.checkIn.questions.${question}.label`);
}

/** One answered check-in as a line: "Energy 3/5 · Hunger 4/5 · Sleep 2/5". */
export function checkInAnswersLineT(
  questions: readonly CheckInQuestion[],
  answers: CheckInAnswers,
  t: T,
): string {
  return questions
    .flatMap((q) => {
      const v = answers[q];
      return v === undefined
        ? []
        : [t('coaching.checkIn.answer', { label: checkInQuestionLabelT(q, t), value: String(v) })];
    })
    .join(' · ');
}

/** The consent screen's "Ana will see:" lines (also Your trainer's "What Ana sees"). */
export function consentWillSeeLines(t: T): string[] {
  return [
    t('coaching.consent.willSee.routine'),
    t('coaching.consent.willSee.workouts'),
    t('coaching.consent.willSee.attendance'),
  ];
}

/** The consent screen's "Ana can:" lines (also Your trainer's "What Ana can do"). */
export function consentCanLines(trainer: string, t: T): string[] {
  return [
    t('coaching.consent.can.routine'),
    t('coaching.consent.can.seeChanges', { trainer }),
    t('coaching.consent.can.book'),
    t('coaching.consent.can.log', { trainer }),
  ];
}
