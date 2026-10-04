'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangedByLine } from '@/features/coaching/components/RoutineAttribution';
import { ConflictDialog } from '@/features/gym/routine/components/ConflictDialog';
import { DesktopEditorBoard } from '@/features/gym/routine/components/DesktopEditorBoard';
import { ExercisePickerSheet } from '@/features/gym/routine/components/ExercisePickerSheet';
import {
  OverrideTargetSheet,
  type OverrideTargetSheetTarget,
} from '@/features/gym/routine/components/OverrideTargetSheet';
import { PhoneEditorList } from '@/features/gym/routine/components/PhoneEditorList';
import { keepMineExpectedVersion, resolveTheirsDraft } from '@/features/gym/routine/conflict';
import {
  draftReducer,
  fromTrainerRoutineDto,
  isDraftEqual,
  toTrainerRoutineDoc,
  type DraftAction,
  type DraftExercise,
  type DraftRoutine,
} from '@/features/gym/routine/draft';
import { useEditorShortcuts } from '@/features/gym/routine/use-editor-shortcuts';
import {
  confirmDiscardChanges,
  useUnsavedChangesWarning,
} from '@/features/gym/routine/use-unsaved-warning';
import { SupersetSheet } from '@/features/gym/shared/superset-sheet';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, COACHING_LIMITS, type RoutineDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { supersetSlot, userFacingErrorMessage, type ExerciseLookup } from '@chefer/utils';
import { draftFromOwnRoutine } from '../fill-from-mine';
import { isClientUnavailable, useClientOverview } from '../use-client-overview';
import { useTrainerUnit } from '../use-trainer-unit';
import { ClientHeader } from './ClientHeader';
import { ClientUnavailable } from './ClientUnavailable';
import { FillFromMineSheet } from './FillFromMineSheet';
import { NextSessionPanel, type NextRowTarget } from './NextSessionPanel';
import { PrivateNotesPanel } from './PrivateNotesPanel';
import { TrainerNoteField } from './TrainerNoteField';

// ─── /trainer/[clientId]/routine (spec §2.5 tab 1) ────────────────────────────
// The client's active routine in the SAME editor components the owner uses
// (DesktopEditorBoard / PhoneEditorList / picker / conflict dialog), fed by
// `trainer.client.*`. The seams: a note field per exercise, "Changed by Maria"
// stamps, curated-only picker. Next-session targets sit beside the editor.

export function TrainerRoutineEditor({ clientId }: { clientId: string }) {
  const copy = COACHING_COPY.trainer;
  const utils = trpc.useUtils();
  const unit = useTrainerUnit();
  const overview = useClientOverview(clientId);
  const routineQuery = trpc.trainer.client.routine.useQuery(
    { clientId, today: localDate() },
    { retry: false, staleTime: 15_000 },
  );
  const library = trpc.gym.library.list.useQuery(undefined, { staleTime: 5 * 60_000 });

  const routine = routineQuery.data ?? null;
  const clientName = overview.data?.client.name ?? '';
  const firstName = clientName.trim().split(/\s+/)[0] ?? clientName;

  const [draft, setDraft] = useState<DraftRoutine | null>(null);
  const [baseline, setBaseline] = useState<DraftRoutine | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [conflictCurrent, setConflictCurrent] = useState<RoutineDto | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerDayKey, setPickerDayKey] = useState<string | null>(null);
  const [supersetDayKey, setSupersetDayKey] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ dayKey: string; exerciseKey: string } | null>(
    null,
  );
  const [fillOpen, setFillOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<NextRowTarget | null>(null);

  // Seed once per loaded routine; a background refetch never clobbers in-flight edits.
  useEffect(() => {
    if (routine && draft === null) {
      const seeded = fromTrainerRoutineDto(routine);
      setDraft(seeded);
      setBaseline(seeded);
      setVersion(routine.version);
    }
  }, [routine, draft]);

  const dispatch = useCallback((action: DraftAction) => {
    setDraft((prev) => (prev ? draftReducer(prev, action) : prev));
  }, []);

  const isDirty = draft !== null && baseline !== null && !isDraftEqual(draft, baseline);
  useUnsavedChangesWarning(isDirty);

  const noteTooLong =
    draft?.days.some((d) =>
      d.exercises.some((e) => (e.trainerNote ?? '').length > COACHING_LIMITS.trainerNoteMaxChars),
    ) ?? false;

  // Chefer's own exercises (picker, fill-from-mine) + whatever the routine already uses,
  // including the client's custom exercises (named, but never addable).
  const lookup: ExerciseLookup = useMemo(() => {
    const byId = new Map<string, NonNullable<ReturnType<ExerciseLookup>>>();
    for (const exercise of library.data ?? []) byId.set(exercise.id, exercise);
    for (const exercise of routine?.exercises ?? []) {
      if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
    }
    return (id) => byId.get(id);
  }, [library.data, routine?.exercises]);
  const curatedIds = useMemo(
    () => new Set((library.data ?? []).filter((e) => !e.ownerId).map((e) => e.id)),
    [library.data],
  );

  const rowById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof routine>['days'][number]['exercises'][number]>();
    for (const day of routine?.days ?? []) for (const row of day.exercises) map.set(row.id, row);
    return map;
  }, [routine]);

  const refresh = () => {
    void utils.trainer.client.routine.invalidate({ clientId });
    void utils.trainer.clients.list.invalidate();
  };

  const saveMutation = trpc.trainer.client.saveRoutine.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      const seeded = fromTrainerRoutineDto(saved);
      setDraft(seeded);
      setBaseline(seeded);
      setVersion(saved.version);
      setConflictCurrent(null);
      setSaveError(null);
      utils.trainer.client.routine.setData({ clientId, today: localDate() }, saved);
      refresh();
    },
    onError: (err) => {
      if (err.data?.conflict) setConflictCurrent(err.data.conflict.current);
      else setSaveError(userFacingErrorMessage(err));
    },
  });

  const handleSave = useCallback(() => {
    if (!draft || version === null || noteTooLong) return;
    saveMutation.mutate({
      clientId,
      routine: toTrainerRoutineDoc(draft),
      expectedVersion: version,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable per tRPC
  }, [draft, version, noteTooLong, clientId]);
  useEditorShortcuts({ onSave: handleSave, enabled: draft !== null });

  const createRoutine = trpc.trainer.client.createRoutine.useMutation({
    meta: { silent: true },
    onSuccess: refresh,
    onError: (err) => setSaveError(userFacingErrorMessage(err)),
  });
  const setTarget = trpc.trainer.client.setNextTarget.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setAdjusting(null);
      refresh();
    },
    onError: (err) => setSaveError(userFacingErrorMessage(err)),
  });
  const clearTarget = trpc.trainer.client.clearNextTarget.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setAdjusting(null);
      refresh();
    },
    onError: (err) => setSaveError(userFacingErrorMessage(err)),
  });

  const swapExerciseId = swapTarget
    ? draft?.days
        .find((d) => d.key === swapTarget.dayKey)
        ?.exercises.find((e) => e.key === swapTarget.exerciseKey)?.exerciseId
    : undefined;

  const supersetDay = draft?.days.find((d) => d.key === supersetDayKey) ?? null;
  const supersetItems = (supersetDay?.exercises ?? []).map((exercise, index) => {
    const slot = supersetSlot(supersetDay?.exercises ?? [], index);
    return {
      id: exercise.key,
      name: lookup(exercise.exerciseId)?.name ?? exercise.exerciseId,
      badge: slot ? `${slot.label}${slot.position + 1}` : null,
    };
  });

  if (overview.isError && isClientUnavailable(overview.error)) return <ClientUnavailable />;
  if (routineQuery.isError && isClientUnavailable(routineQuery.error)) return <ClientUnavailable />;

  const header = (
    <ClientHeader
      clientId={clientId}
      name={clientName || copy.clients}
      active="routine"
      confirmLeave={() => confirmDiscardChanges(isDirty)}
    />
  );
  const frame = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {header}
      {children}
    </div>
  );

  if (routineQuery.isError) {
    return frame(
      <p role="alert" className="text-sm text-gray-700">
        {userFacingErrorMessage(routineQuery.error)}
      </p>,
    );
  }
  if (routineQuery.isLoading || overview.isLoading) {
    return frame(<div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />);
  }

  if (routine === null) {
    return frame(
      <div className="flex max-w-lg flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-700">{COACHING_COPY.server.noActiveRoutine}</p>
        <Button
          type="button"
          className="min-h-11 self-start"
          loading={createRoutine.isPending}
          onClick={() => createRoutine.mutate({ clientId, days: 3 })}
        >
          Create a 3-day routine
        </Button>
        {saveError && (
          <p role="alert" className="text-sm text-red-700">
            {saveError}
          </p>
        )}
      </div>,
    );
  }

  if (!draft)
    return frame(<div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />);

  const renderAttribution = (_dayKey: string, exercise: DraftExercise) => {
    const stamp = exercise.id ? rowById.get(exercise.id)?.lastEditedByOther : null;
    return stamp ? (
      <div className="mt-1">
        <ChangedByLine name={stamp.name} at={stamp.at} />
      </div>
    ) : null;
  };
  const renderExtra = (dayKey: string, exercise: DraftExercise) => (
    <TrainerNoteField
      clientName={firstName}
      value={exercise.trainerNote ?? ''}
      onChange={(value) =>
        dispatch({
          type: 'update_exercise',
          dayKey,
          exerciseKey: exercise.key,
          patch: { trainerNote: value },
        })
      }
    />
  );

  const adjustTarget: OverrideTargetSheetTarget | null = adjusting
    ? (() => {
        const meta = lookup(adjusting.row.exerciseId);
        const override = adjusting.next.override;
        return {
          exerciseId: adjusting.row.exerciseId,
          repBucket: adjusting.next.repBucket,
          repRangeLabel: adjusting.next.repBucket,
          exerciseName: adjusting.name,
          loadType: meta?.loadType ?? 'WEIGHTED',
          perHand: meta?.perHand ?? false,
          isTimed: meta?.isTimed ?? false,
          suggestion: adjusting.next.suggestion,
          override: override
            ? { weightKg: override.weightKg, reps: override.reps, at: override.at }
            : null,
        };
      })()
    : null;

  return frame(
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            onChange={(e) => dispatch({ type: 'rename_routine', name: e.target.value })}
            aria-label="Routine name"
            className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1 font-serif text-xl font-semibold text-gray-900 focus:border-gray-300 focus:bg-white focus:outline-none"
          />
          {routine.lastEditedByOther && (
            <div className="px-1">
              <ChangedByLine
                name={routine.lastEditedByOther.name}
                at={routine.lastEditedByOther.at}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setFillOpen(true)}
          >
            {copy.fillFromMine}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={handleSave}
            disabled={!isDirty || noteTooLong}
            loading={saveMutation.isPending}
          >
            Save changes
          </Button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-red-700">
          {saveError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0">
          <div className="hidden lg:block">
            <DesktopEditorBoard
              draft={draft}
              dispatch={dispatch}
              lookup={lookup}
              onAddDay={() => dispatch({ type: 'add_day' })}
              onOpenPicker={setPickerDayKey}
              onOpenSuperset={setSupersetDayKey}
              onSwap={(dayKey, exerciseKey) => setSwapTarget({ dayKey, exerciseKey })}
              renderAttribution={renderAttribution}
              renderExtra={renderExtra}
            />
          </div>
          <PhoneEditorList
            draft={draft}
            dispatch={dispatch}
            lookup={lookup}
            onAddDay={() => dispatch({ type: 'add_day' })}
            onOpenPicker={setPickerDayKey}
            onOpenSuperset={setSupersetDayKey}
            onSwap={(dayKey, exerciseKey) => setSwapTarget({ dayKey, exerciseKey })}
            renderAttribution={renderAttribution}
            renderExtra={renderExtra}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <NextSessionPanel
            routine={routine}
            clientName={firstName}
            unit={unit}
            lookup={lookup}
            busy={clearTarget.isPending}
            onAdjust={setAdjusting}
            onReset={(target) =>
              clearTarget.mutate({
                clientId,
                exerciseId: target.row.exerciseId,
                repBucket: target.next.repBucket,
              })
            }
          />
          <PrivateNotesPanel clientId={clientId} clientName={firstName} />
        </div>
      </div>

      <ExercisePickerSheet
        open={pickerDayKey !== null || swapTarget !== null}
        onClose={() => {
          setPickerDayKey(null);
          setSwapTarget(null);
        }}
        library={library.data ?? []}
        curatedOnly
        title={swapTarget ? 'Swap exercise' : 'Add exercise'}
        preferSwapGroup={swapTarget ? lookup(swapExerciseId ?? '')?.swapGroup : null}
        excludeIds={swapExerciseId ? [swapExerciseId] : []}
        onPick={(exercise) => {
          if (pickerDayKey) {
            dispatch({ type: 'add_exercise', dayKey: pickerDayKey, exercise });
            setPickerDayKey(null);
          } else if (swapTarget) {
            dispatch({
              type: 'swap_exercise',
              dayKey: swapTarget.dayKey,
              exerciseKey: swapTarget.exerciseKey,
              newExerciseId: exercise.id,
            });
            setSwapTarget(null);
          }
        }}
      />

      <SupersetSheet
        open={supersetDay !== null}
        onClose={() => setSupersetDayKey(null)}
        items={supersetItems}
        onGroup={(exerciseKeys) => {
          if (supersetDay) {
            dispatch({ type: 'create_superset', dayKey: supersetDay.key, exerciseKeys });
          }
          setSupersetDayKey(null);
        }}
      />

      <FillFromMineSheet
        open={fillOpen}
        onClose={() => setFillOpen(false)}
        onPick={(own) => {
          const result = draftFromOwnRoutine(own, draft, curatedIds);
          setDraft(result.draft);
          setFillOpen(false);
        }}
      />

      <OverrideTargetSheet
        target={adjustTarget}
        unit={unit}
        coaching={{ clientName: firstName }}
        saving={setTarget.isPending || clearTarget.isPending}
        onClose={() => setAdjusting(null)}
        onSave={(weightKg, reps) => {
          if (!adjusting) return;
          setTarget.mutate({
            clientId,
            exerciseId: adjusting.row.exerciseId,
            repBucket: adjusting.next.repBucket,
            weightKg,
            reps,
          });
        }}
        onReset={() => {
          if (!adjusting) return;
          clearTarget.mutate({
            clientId,
            exerciseId: adjusting.row.exerciseId,
            repBucket: adjusting.next.repBucket,
          });
        }}
      />

      <ConflictDialog
        open={conflictCurrent !== null}
        saving={saveMutation.isPending}
        changedBy={conflictCurrent?.lastEditedByOther?.name ?? firstName}
        onUseTheirs={() => {
          if (!conflictCurrent) return;
          const resolved = resolveTheirsDraft(conflictCurrent);
          setDraft(resolved.draft);
          setBaseline(resolved.baseline);
          setVersion(resolved.version);
          setConflictCurrent(null);
          refresh();
        }}
        onKeepMine={() => {
          if (!conflictCurrent) return;
          const expectedVersion = keepMineExpectedVersion(conflictCurrent);
          setConflictCurrent(null);
          saveMutation.mutate({ clientId, routine: toTrainerRoutineDoc(draft), expectedVersion });
        }}
      />
    </>,
  );
}
