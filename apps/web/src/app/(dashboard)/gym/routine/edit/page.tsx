'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { captureGymEvent } from '@/features/gym/analytics';
import { ConflictDialog } from '@/features/gym/routine/components/ConflictDialog';
import { DesktopEditorBoard } from '@/features/gym/routine/components/DesktopEditorBoard';
import { ExercisePickerSheet } from '@/features/gym/routine/components/ExercisePickerSheet';
import { PhoneEditorList } from '@/features/gym/routine/components/PhoneEditorList';
import { WeeklyBalancePanel } from '@/features/gym/routine/components/WeeklyBalancePanel';
import { keepMineExpectedVersion, resolveTheirsDraft } from '@/features/gym/routine/conflict';
import {
  draftReducer,
  fromRoutineDto,
  isDraftEqual,
  toRoutineDoc,
  toRoutineLike,
  type DraftAction,
  type DraftRoutine,
} from '@/features/gym/routine/draft';
import { useEditorShortcuts } from '@/features/gym/routine/use-editor-shortcuts';
import {
  confirmDiscardChanges,
  useUnsavedChangesWarning,
} from '@/features/gym/routine/use-unsaved-warning';
import { libraryLookup, useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';
import { TEMPLATE_BY_KEY, type RoutineDto } from '@chefer/types';
import { validateRoutine, volumeByGroup } from '@chefer/utils';
import RoutineEditLoading from './loading';

export default function RoutineEditPage() {
  const hasMounted = useHasMounted();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const utils = trpc.useUtils();

  const {
    data: routine,
    isLoading,
    error,
  } = trpc.gym.routine.get.useQuery({ id: id ?? '' }, { enabled: hasMounted && !!id });
  const { data: bootstrap } = useGymBootstrap({ enabled: hasMounted });

  const [draft, setDraft] = useState<DraftRoutine | null>(null);
  const [baseline, setBaseline] = useState<DraftRoutine | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [conflictCurrent, setConflictCurrent] = useState<RoutineDto | null>(null);
  const [pickerDayKey, setPickerDayKey] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ dayKey: string; exerciseKey: string } | null>(
    null,
  );

  // Seed the local draft once per loaded routine. Guarded so a background
  // refetch (e.g. after invalidation elsewhere) never clobbers in-flight edits.
  useEffect(() => {
    if (routine && draft === null) {
      const seeded = fromRoutineDto(routine);
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

  const saveMutation = trpc.gym.routine.save.useMutation({
    onSuccess: (saved) => {
      captureGymEvent('routine_edited', { kind: 'save' });
      void utils.gym.bootstrap.invalidate();
      void utils.gym.routine.list.invalidate();
      void utils.gym.routine.get.invalidate({ id: saved.id });
      const seeded = fromRoutineDto(saved);
      setDraft(seeded);
      setBaseline(seeded);
      setVersion(saved.version);
      setConflictCurrent(null);
    },
    onError: (err) => {
      if (err.data?.conflict) {
        setConflictCurrent(err.data.conflict.current);
      } else {
        alert(`Failed to save routine: ${err.message}`);
      }
    },
  });

  const handleSave = useCallback(() => {
    if (!draft || version === null) return;
    saveMutation.mutate({ routine: toRoutineDoc(draft), expectedVersion: version });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable per tRPC
  }, [draft, version]);

  useEditorShortcuts({ onSave: handleSave, enabled: draft !== null });

  const lookup = useMemo(
    () => (bootstrap ? libraryLookup(bootstrap) : () => undefined),
    [bootstrap],
  );
  const experience = bootstrap?.profile?.experience ?? 'INTERMEDIATE';
  const suppressLowVolume = routine?.templateKey
    ? (TEMPLATE_BY_KEY.get(routine.templateKey)?.suppressLowVolumeHints ?? false)
    : false;

  const volume = useMemo(
    () => (draft ? volumeByGroup(toRoutineLike(draft), lookup, experience) : []),
    [draft, lookup, experience],
  );
  const hints = useMemo(
    () =>
      draft ? validateRoutine(toRoutineLike(draft), lookup, experience, { suppressLowVolume }) : [],
    [draft, lookup, experience, suppressLowVolume],
  );

  const swapExerciseId = swapTarget
    ? draft?.days
        .find((d) => d.key === swapTarget.dayKey)
        ?.exercises.find((e) => e.key === swapTarget.exerciseKey)?.exerciseId
    : undefined;

  const handleBack = () => {
    if (!confirmDiscardChanges(isDirty)) return;
    router.push('/gym/routine');
  };

  if (!id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="sr-only">Edit routine</h1>
        <p className="text-sm text-gray-500">No routine selected.</p>
        <Link
          href="/gym/routine/all"
          className="inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline"
        >
          Go to My routines
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="sr-only">Edit routine</h1>
        <p className="text-sm text-gray-500">{error.message}</p>
        <Link
          href="/gym/routine/all"
          className="inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline"
        >
          Go to My routines
        </Link>
      </div>
    );
  }

  if (!hasMounted || isLoading || !draft) return <RoutineEditLoading />;

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="sr-only">Edit routine</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back to routine"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            value={draft.name}
            onChange={(e) => dispatch({ type: 'rename_routine', name: e.target.value })}
            aria-label="Routine name"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 font-serif text-xl font-semibold text-gray-900 focus:border-gray-300 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Desktop: DnD board with a live, sticky weekly-balance side panel. */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[1fr_320px] lg:items-start">
        <DesktopEditorBoard
          draft={draft}
          dispatch={dispatch}
          lookup={lookup}
          onAddDay={() => dispatch({ type: 'add_day' })}
          onOpenPicker={setPickerDayKey}
          onSwap={(dayKey, exerciseKey) => setSwapTarget({ dayKey, exerciseKey })}
        />
        <WeeklyBalancePanel
          routineId={draft.id}
          volume={volume}
          hints={hints}
          className="sticky top-4"
        />
      </div>

      {/* Phone: move-up/down buttons instead of drag. */}
      <PhoneEditorList
        draft={draft}
        dispatch={dispatch}
        lookup={lookup}
        onAddDay={() => dispatch({ type: 'add_day' })}
        onOpenPicker={setPickerDayKey}
        onSwap={(dayKey, exerciseKey) => setSwapTarget({ dayKey, exerciseKey })}
      />
      <div className="lg:hidden">
        <WeeklyBalancePanel routineId={draft.id} volume={volume} hints={hints} />
      </div>

      <ExercisePickerSheet
        open={pickerDayKey !== null || swapTarget !== null}
        onClose={() => {
          setPickerDayKey(null);
          setSwapTarget(null);
        }}
        library={bootstrap?.library ?? []}
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

      <ConflictDialog
        open={conflictCurrent !== null}
        saving={saveMutation.isPending}
        onUseTheirs={() => {
          if (!conflictCurrent) return;
          const resolved = resolveTheirsDraft(conflictCurrent);
          setDraft(resolved.draft);
          setBaseline(resolved.baseline);
          setVersion(resolved.version);
          setConflictCurrent(null);
        }}
        onKeepMine={() => {
          if (!conflictCurrent) return;
          const expectedVersion = keepMineExpectedVersion(conflictCurrent);
          setConflictCurrent(null);
          saveMutation.mutate({ routine: toRoutineDoc(draft), expectedVersion });
        }}
      />
    </div>
  );
}
