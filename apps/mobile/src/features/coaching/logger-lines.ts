import type { Translator } from '@chefer/i18n';
import type { GymBootstrap, ProgressionDto, SessionExerciseDoc } from '@chefer/types';
import { repBucket } from '@chefer/utils';
import { getTranslator } from '../../lib/i18n';
import { editorLabelT, trainerNameOrFallbackT } from './copy';

// ─── Workout logger: the trainer's cue and "Set by Ana" (spec §2.6) ───────────
// Both come from the cached bootstrap at render time, never from the session document: the document is
// uploaded to the server, and a trainer note must not travel back inside a client's workout. Absent
// below API level 6 (the fields are not sent), so an uncoached user's logger is unchanged.

export type TrainerLines = {
  /** The trainer's name for "Ana: <note>". */
  trainerName: string;
  /** The trainer's cue for this exercise, if the routine row still carries one. */
  noteFor: (se: SessionExerciseDoc) => string | null;
  /** Who set this exercise's next target ("Ana"), when the trainer did; null for the app's / your own. */
  setByFor: (se: SessionExerciseDoc) => string | null;
};

function overrideFor(
  progressions: readonly ProgressionDto[],
  se: SessionExerciseDoc,
): ProgressionDto | undefined {
  const bucket = repBucket(se.repMin, se.repMax);
  return progressions.find((p) => p.exerciseId === se.exerciseId && p.repBucket === bucket);
}

/** Null when the bootstrap carries no trainer information at all (the common case). */
export function buildTrainerLines(
  bootstrap: GymBootstrap | undefined,
  routineDayId: string | null,
  t: Translator['t'] = getTranslator().t,
): TrainerLines | null {
  if (!bootstrap) return null;
  const day =
    routineDayId === null
      ? undefined
      : bootstrap.activeRoutine?.days.find((d) => d.id === routineDayId);
  const hasNotes = day?.exercises.some((e) => e.trainerNote) ?? false;
  const hasSetBy = bootstrap.progressions.some((p) => p.override?.setByName);
  if (!hasNotes && !hasSetBy) return null;

  return {
    trainerName: trainerNameOrFallbackT(bootstrap.coaching?.trainerName, t),
    noteFor: (se) => {
      if (se.routineExerciseId === null) return null;
      const row = day?.exercises.find((e) => e.id === se.routineExerciseId);
      // A one-off swap ("Just today") is another exercise: the cue was for the original.
      if (row?.exerciseId !== se.exerciseId) return null;
      return row.trainerNote?.trim() ? row.trainerNote : null;
    },
    setByFor: (se) => {
      if (se.prescription.reasonCode !== 'USER_OVERRIDE') return null;
      const override = overrideFor(bootstrap.progressions, se)?.override;
      // Through the shared label, like every "Set by …" (PRD 2026-10 §4.3): "Ana (former trainer)".
      return override?.setByName
        ? editorLabelT({ name: override.setByName, former: override.setByFormer }, t)
        : null;
    },
  };
}
