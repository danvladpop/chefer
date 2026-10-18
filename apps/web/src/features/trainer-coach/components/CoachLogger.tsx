'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FALLBACK_PROFILE } from '@/features/gym/shared/use-gym-data';
import { ExerciseCard } from '@/features/gym/workout/components/exercise-card';
import { PlateSheet } from '@/features/gym/workout/components/plate-sheet';
import { newId } from '@/features/gym/workout/ids';
import {
  currentExerciseId,
  currentFocus,
  propagateEditActions,
  setLabelOf,
  sortedExercises,
  supersetsOf,
  workingSets,
  type WorkoutActionInput,
} from '@/features/gym/workout/workout-model';
import { ActionItem, NoteSheet, SetMenuSheet } from '@/features/gym/workout/workout-view';
import { CircleSlash, Minus, Plus, StickyNote } from 'lucide-react';
import {
  EXERCISE_BY_ID,
  GYM_MAX_SETS_PER_EXERCISE,
  type ExerciseMeta,
  type Rir,
  type SessionSetDoc,
} from '@chefer/types';
import { Sheet, Toast } from '@chefer/ui';
import { sessionSupersetKey, type SessionSupersetSlot } from '@chefer/utils';
import type { CoachClientWorkout } from '../coach-state';

// One client's workout in the coached logger: the trainer's own logger's
// exercise cards (ExerciseCard), set menu, plate sheet and reducer actions, run
// against the CLIENT's prescription — their units, suggestions and last-time
// columns all come from `trainer.coach.start`. Swap / add exercise are left out:
// they need the client's progressions and library, which stay on the server.

const NO_SETS: { weightKg: number; reps: number }[] = [];

export function CoachLogger({
  entry,
  onDispatch,
}: {
  entry: CoachClientWorkout & { doc: NonNullable<CoachClientWorkout['doc']> };
  onDispatch: (
    action: WorkoutActionInput,
    supersets: ReadonlyMap<string, SessionSupersetSlot>,
  ) => void;
}) {
  const session = entry.doc;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [plateKg, setPlateKg] = useState<number | null>(null);
  const [setMenu, setSetMenu] = useState<{ seId: string; setId: string } | null>(null);
  const [undoRemove, setUndoRemove] = useState<{
    seId: string;
    set: SessionSetDoc;
    index: number;
    label: string;
  } | null>(null);

  // Docs started here own their superset letters (S-D3): no routine needed.
  const derived = supersetsOf(session, null);
  const supersetKey = sessionSupersetKey(derived);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the grouping, not the doc
  const supersets = useMemo(() => derived, [supersetKey]);
  const supersetsRef = useRef(supersets);
  useEffect(() => {
    supersetsRef.current = supersets;
  }, [supersets]);

  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseMeta>(entry.exercises.map((e) => [e.id, e]));
    return (id: string): ExerciseMeta | undefined => byId.get(id) ?? EXERCISE_BY_ID.get(id);
  }, [entry.exercises]);
  const dtoById = useMemo(
    () => new Map(entry.exercises.map((e) => [e.id, e] as const)),
    [entry.exercises],
  );
  // The client's last time and the trainer's own cues, from the prescription.
  const lastTimeByExercise = useMemo(() => {
    const map = new Map<string, { weightKg: number; reps: number }[]>();
    for (const row of entry.workout?.exercises ?? []) {
      if (row.lastTime && !map.has(row.exerciseId)) map.set(row.exerciseId, row.lastTime.sets);
    }
    return map;
  }, [entry.workout]);
  const cueByRowId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of entry.workout?.exercises ?? []) {
      if (row.trainerNote) map.set(row.routineExerciseId, row.trainerNote);
    }
    return map;
  }, [entry.workout]);
  const profile = useMemo(() => ({ ...FALLBACK_PROFILE, unit: entry.unit }), [entry.unit]);

  const focus = currentFocus(session, supersets);
  const current = currentExerciseId(session, supersets);
  // Auto-advance like the trainer's own logger: the current exercise opens.
  const lastCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (!current || current === lastCurrent.current) return;
    const hadCurrent = lastCurrent.current !== null;
    lastCurrent.current = current;
    setExpanded((prev) => new Set(prev).add(current));
    const el = document.getElementById(`coach-se-${current}`);
    if (el && hadCurrent) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [current]);

  const act = useCallback(
    (action: WorkoutActionInput) => onDispatch(action, supersetsRef.current),
    [onDispatch],
  );
  const onEditSet = useCallback(
    (seId: string, setId: string, patch: { weightKg?: number; reps?: number }) => {
      const se = session.exercises.find((e) => e.id === seId);
      const set = se?.sets.find((s) => s.id === setId);
      act({ type: 'editSet', seId, setId, ...patch });
      if (se && set) for (const later of propagateEditActions(se, set, patch)) act(later);
    },
    [act, session],
  );
  const onToggleSet = useCallback(
    (seId: string, set: SessionSetDoc) =>
      act(
        set.completedAt === null
          ? { type: 'completeSet', seId, setId: set.id }
          : { type: 'uncompleteSet', seId, setId: set.id },
      ),
    [act],
  );
  const onSetRir = useCallback(
    (seId: string, rir: Rir | null) => act({ type: 'setRir', seId, rir }),
    [act],
  );
  const onToggleExpanded = useCallback((seId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seId)) next.delete(seId);
      else next.add(seId);
      return next;
    });
  }, []);
  const onOpenActions = useCallback((seId: string) => setActionsFor(seId), []);
  const onOpenPlates = useCallback((kg: number) => setPlateKg(kg), []);
  const onOpenSetMenu = useCallback(
    (seId: string, setId: string) => setSetMenu({ seId, setId }),
    [],
  );

  const exercises = sortedExercises(session);
  const actionsSe = exercises.find((e) => e.id === actionsFor) ?? null;
  const noteSe = exercises.find((e) => e.id === noteFor) ?? null;
  const menuSe = setMenu ? exercises.find((e) => e.id === setMenu.seId) : undefined;

  return (
    <>
      <div className="space-y-3" data-testid="coach-logger">
        {exercises.map((se, idx) => {
          const slot = supersets.get(se.id);
          return (
            <div key={se.id} id={`coach-se-${se.id}`} className="scroll-mt-48">
              <ExerciseCard
                se={se}
                meta={lookup(se.exerciseId)}
                dto={dtoById.get(se.exerciseId)}
                index={idx}
                expanded={expanded.has(se.id)}
                supersetLabel={slot?.label ?? null}
                supersetIndex={slot?.index ?? 0}
                focusSetId={focus?.seId === se.id ? focus.setId : null}
                onToggleExpanded={onToggleExpanded}
                profile={profile}
                unit={entry.unit}
                lastTime={lastTimeByExercise.get(se.exerciseId) ?? NO_SETS}
                trainerNote={cueByRowId.get(se.routineExerciseId ?? '') ?? null}
                trainerName="You"
                prSetId={null}
                prKind={null}
                onEditSet={onEditSet}
                onToggleSet={onToggleSet}
                onSetRir={onSetRir}
                onOpenActions={onOpenActions}
                onOpenPlates={onOpenPlates}
                onOpenSetMenu={onOpenSetMenu}
              />
            </div>
          );
        })}
      </div>

      <Sheet
        open={actionsSe !== null}
        onClose={() => setActionsFor(null)}
        title={actionsSe ? (lookup(actionsSe.exerciseId)?.name ?? 'Exercise') : 'Exercise'}
        description="Changes apply to this workout only."
        size="sm"
      >
        {actionsSe && (
          <ul className="px-3 pb-4" data-testid="coach-exercise-actions">
            <ActionItem
              icon={CircleSlash}
              label={actionsSe.skipped ? 'Un-skip exercise' : 'Skip exercise'}
              onClick={() => {
                act({ type: 'skipExercise', seId: actionsSe.id, skipped: !actionsSe.skipped });
                setActionsFor(null);
              }}
            />
            <ActionItem
              icon={Plus}
              label="Add set"
              disabled={actionsSe.sets.length >= GYM_MAX_SETS_PER_EXERCISE}
              onClick={() => {
                act({ type: 'addSet', seId: actionsSe.id, newSetId: newId() });
                setActionsFor(null);
              }}
            />
            <ActionItem
              icon={Minus}
              label="Remove last set"
              disabled={workingSets(actionsSe).length === 0}
              onClick={() => {
                const last = workingSets(actionsSe).at(-1);
                if (last) act({ type: 'removeSet', seId: actionsSe.id, setId: last.id });
                setActionsFor(null);
              }}
            />
            <ActionItem
              icon={StickyNote}
              label={actionsSe.notes ? 'Edit note' : 'Add note'}
              onClick={() => {
                setNoteFor(actionsSe.id);
                setActionsFor(null);
              }}
            />
          </ul>
        )}
      </Sheet>

      <NoteSheet
        key={noteFor ?? 'none'}
        open={noteSe !== null}
        title="Exercise note"
        initial={noteSe?.notes ?? ''}
        max={500}
        onClose={() => setNoteFor(null)}
        onSave={(text) => {
          const notes = text.trim() === '' ? null : text.trim();
          act({ type: 'setNote', seId: noteFor, notes });
          setNoteFor(null);
        }}
      />

      <SetMenuSheet
        label={setMenu && menuSe ? setLabelOf(menuSe, setMenu.setId) : null}
        exerciseName={menuSe ? (lookup(menuSe.exerciseId)?.name ?? 'Exercise') : ''}
        onClose={() => setSetMenu(null)}
        onRemove={() => {
          const set = menuSe?.sets.find((s) => s.id === setMenu?.setId);
          if (menuSe && set) {
            act({ type: 'removeSet', seId: menuSe.id, setId: set.id });
            setUndoRemove({
              seId: menuSe.id,
              set,
              index: set.position,
              label: setLabelOf(menuSe, set.id) ?? 'set',
            });
          }
          setSetMenu(null);
        }}
      />

      {undoRemove && (
        <Toast
          message={`Removed ${undoRemove.label.toLowerCase()}`}
          onClose={() => setUndoRemove(null)}
          duration={8000}
          action={{
            label: 'Undo',
            onClick: () => {
              act({
                type: 'restoreSet',
                seId: undoRemove.seId,
                set: undoRemove.set,
                index: undoRemove.index,
              });
              setUndoRemove(null);
            },
          }}
        />
      )}

      <PlateSheet weightKg={plateKg} profile={profile} onClose={() => setPlateKg(null)} />
    </>
  );
}
