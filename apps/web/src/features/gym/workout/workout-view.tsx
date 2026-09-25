'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import {
  ArrowDown,
  ArrowUp,
  CircleSlash,
  Minus,
  Plus,
  Repeat,
  StickyNote,
  Trash2,
} from 'lucide-react';
import type { ExerciseDto, PrKind, Rir, SessionSetDoc, WorkoutSessionDoc } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { cn, sessionSupersetKey, type SessionSupersetSlot } from '@chefer/utils';
import { ExercisePickerSheet } from '../shared/exercise-picker-sheet';
import { GymSkeleton } from '../shared/gym-card';
import { SyncIndicator } from '../shared/sync-indicator';
import { FALLBACK_PROFILE, useGymData } from '../shared/use-gym-data';
import { ExerciseCard } from './components/exercise-card';
import { PlateSheet } from './components/plate-sheet';
import { RestTimerBar } from './components/rest-timer-bar';
import { newId } from './ids';
import { useActiveWorkout } from './use-active-workout';
import {
  buildAddExerciseAction,
  buildSwapAction,
  currentExerciseId,
  currentFocus,
  formatElapsed,
  isExerciseDone,
  lastTimeSets,
  livePrs,
  sessionProgress,
  setLabelOf,
  sortedExercises,
  supersetsOf,
  unfinishedSets,
  workingSets,
  type WorkoutActionInput,
} from './workout-model';

// ─── Active workout (gym_plan.md §1.3, research §5.1) ─────────────────────────
// Phone: one column of exercise cards, the current one expanded. Desktop (lg):
// the exercise navigator on the left, the active exercise card on the right.
// Every change is a `workoutReducer` action persisted to localStorage before
// the next paint. "The workout screen is sacred": no upsells, tips or modals
// beyond the ones the user opens.

const NO_SETS: { weightKg: number; reps: number }[] = [];
const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

type Picker = { kind: 'swap'; seId: string } | { kind: 'add' } | null;

export function WorkoutView() {
  const router = useRouter();
  const { session, dispatch, finish, discard } = useActiveWorkout();
  const { data, lookup, profile, unit, hasMounted, today } = useGymData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [plateKg, setPlateKg] = useState<number | null>(null);
  const [setMenu, setSetMenu] = useState<{ seId: string; setId: string } | null>(null);
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const [finishing, setFinishing] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  useWakeLock(session !== null);

  // Supersets come from the cached routine (the session has no superset
  // field); kept referentially stable while the grouping itself is unchanged.
  const derivedSupersets = session ? supersetsOf(session, data) : NO_SUPERSETS;
  const supersetKey = sessionSupersetKey(derivedSupersets);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the grouping, not the doc
  const supersets = useMemo(() => derivedSupersets, [supersetKey]);
  const supersetsRef = useRef(supersets);
  useEffect(() => {
    supersetsRef.current = supersets;
  }, [supersets]);

  const focus = session ? currentFocus(session, supersets) : null;
  const current = session ? currentExerciseId(session, supersets) : null;
  // Auto-advance: when the current exercise changes (its last set ticked),
  // focus the next one — on phones by expanding it, on desktop by selecting it.
  const lastCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (!current || current === lastCurrent.current) return;
    const hadCurrent = lastCurrent.current !== null;
    lastCurrent.current = current;
    setSelectedId(current);
    setExpanded((prev) => new Set(prev).add(current));
    // Phones only, and not on the first focus (the page just opened at the top).
    const el = document.getElementById(`se-${current}`);
    if (el && hadCurrent && window.matchMedia('(max-width: 1023px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [current]);

  const history = useMemo(() => data?.recentSessions ?? [], [data?.recentSessions]);
  const prs = useMemo(
    () =>
      session ? livePrs(session, history) : new Map<string, { setId: string; kind: PrKind }>(),
    [session, history],
  );
  // Stable per-exercise "last time" arrays, so memoised cards skip re-rendering.
  const exerciseIdsKey = session ? session.exercises.map((e) => e.exerciseId).join('|') : '';
  const lastTimeByExercise = useMemo(() => {
    const map = new Map<string, { weightKg: number; reps: number }[]>();
    for (const id of exerciseIdsKey.split('|')) {
      if (id && !map.has(id)) map.set(id, lastTimeSets(id, history, session?.id ?? null));
    }
    return map;
  }, [exerciseIdsKey, history, session?.id]);
  const libraryById = useMemo(
    () => new Map((data?.library ?? []).map((e) => [e.id, e] as const)),
    [data?.library],
  );
  const inventory = profile ?? FALLBACK_PROFILE;
  const displayUnit = profile ? unit : inventory.unit;

  const act = useCallback(
    (action: WorkoutActionInput) => dispatch(action, { supersets: supersetsRef.current }),
    [dispatch],
  );
  const onEditSet = useCallback(
    (seId: string, setId: string, patch: { weightKg?: number; reps?: number }) =>
      act({ type: 'editSet', seId, setId, ...patch }),
    [act],
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
    setSelectedId(seId);
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

  if (!hasMounted) {
    return (
      <Frame>
        <GymSkeleton rows={3} />
      </Frame>
    );
  }

  if (!session) {
    return (
      <Frame>
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <p className="text-sm text-gray-600">No workout in progress.</p>
          <Button asChild className="mt-4">
            <Link href="/gym">Back to Today</Link>
          </Button>
        </div>
      </Frame>
    );
  }

  const exercises = sortedExercises(session);
  const progress = sessionProgress(session);
  const selected =
    exercises.find((se) => se.id === selectedId) ??
    exercises.find((se) => se.id === current) ??
    exercises[0] ??
    null;
  const canPrescribe = !!data?.profile;

  const renderCard = (seId: string, forceExpanded: boolean) => {
    const idx = exercises.findIndex((e) => e.id === seId);
    const se = exercises[idx];
    if (!se) return null;
    const slot = supersets.get(se.id);
    return (
      <ExerciseCard
        supersetLabel={slot?.label ?? null}
        supersetIndex={slot?.index ?? 0}
        focusSetId={focus?.seId === se.id ? focus.setId : null}
        onOpenSetMenu={onOpenSetMenu}
        se={se}
        meta={lookup(se.exerciseId)}
        dto={libraryById.get(se.exerciseId)}
        index={idx}
        expanded={forceExpanded || expanded.has(se.id)}
        onToggleExpanded={onToggleExpanded}
        profile={inventory}
        unit={displayUnit}
        lastTime={lastTimeByExercise.get(se.exerciseId) ?? NO_SETS}
        prSetId={prs.get(se.id)?.setId ?? null}
        prKind={prs.get(se.id)?.kind ?? null}
        onEditSet={onEditSet}
        onToggleSet={onToggleSet}
        onSetRir={onSetRir}
        onOpenActions={onOpenActions}
        onOpenPlates={onOpenPlates}
      />
    );
  };

  const doFinish = async () => {
    setFinishing(true);
    const prCount = prs.size;
    const finished = await finish();
    setConfirm(null);
    if (!finished) {
      setFinishing(false);
      return;
    }
    capture('workout_finished', {
      durationMin: Math.round(
        (Date.parse(finished.finishedAt ?? finished.startedAt) - Date.parse(finished.startedAt)) /
          60000,
      ),
      sets: progress.done,
      prs: prCount,
      offline: typeof navigator !== 'undefined' && !navigator.onLine,
    });
    router.replace(`/gym/summary/${finished.id}`);
  };

  const actionsSe = exercises.find((e) => e.id === actionsFor) ?? null;
  const noteSe = noteFor === 'session' ? null : (exercises.find((e) => e.id === noteFor) ?? null);

  return (
    <Frame>
      <WorkoutHeader
        session={session}
        done={progress.done}
        planned={progress.planned}
        onFinish={() => (unfinishedSets(session) > 0 ? setConfirm('finish') : void doFinish())}
        finishing={finishing}
      />

      <div className="mt-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Desktop navigator */}
        <nav
          aria-label="Exercises"
          className="hidden lg:sticky lg:top-24 lg:block"
          data-testid="gym-exercise-navigator"
        >
          <ol className="space-y-1">
            {exercises.map((se, i) => {
              const meta = lookup(se.exerciseId);
              const sets = workingSets(se);
              const doneSets = sets.filter((s) => s.completedAt !== null).length;
              const active = selected?.id === se.id;
              return (
                <li key={se.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(se.id)}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                      active ? 'bg-[#fff3e8] text-[#944a00]' : 'text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        isExerciseDone(se)
                          ? 'bg-emerald-600 text-white'
                          : active
                            ? 'bg-[#944a00] text-white'
                            : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {se.skipped ? '–' : isExerciseDone(se) ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {supersets.get(se.id) && (
                        <span className="mr-1 font-bold text-violet-700">
                          {supersets.get(se.id)?.label}
                          {(supersets.get(se.id)?.index ?? 0) + 1}
                        </span>
                      )}
                      {meta?.name ?? 'Exercise'}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">
                      {se.skipped ? 'skip' : `${doneSets}/${sets.length}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => setPicker({ kind: 'add' })}
            disabled={!canPrescribe}
          >
            <Plus aria-hidden="true" />
            Add exercise
          </Button>
          <SyncIndicator className="mt-2" />
        </nav>

        {/* Phone: every card in order. Desktop: only the selected card. */}
        <div className="min-w-0">
          {isDesktop ? (
            selected ? (
              <>
                {supersets.get(selected.id) && (
                  <SupersetHeading
                    label={supersets.get(selected.id)?.label ?? ''}
                    restSec={
                      exercises.find((e) => e.id === supersets.get(selected.id)?.memberIds.at(-1))
                        ?.restSec ?? selected.restSec
                    }
                  />
                )}
                {renderCard(selected.id, true)}
              </>
            ) : null
          ) : (
            <div className="space-y-3">
              {exercises.map((se) => {
                const slot = supersets.get(se.id);
                const lastId = slot?.memberIds[slot.memberIds.length - 1];
                const restSec = exercises.find((e) => e.id === lastId)?.restSec ?? se.restSec;
                return (
                  <div key={se.id} id={`se-${se.id}`} className="scroll-mt-32">
                    {slot?.index === 0 && <SupersetHeading label={slot.label} restSec={restSec} />}
                    {renderCard(se.id, false)}
                  </div>
                );
              })}
            </div>
          )}

          {exercises.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-gray-600">
              Freestyle: add your first exercise.
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:hidden">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setPicker({ kind: 'add' })}
              disabled={!canPrescribe}
            >
              <Plus aria-hidden="true" />
              Add exercise
            </Button>
          </div>
          {!canPrescribe && (
            <p className="mt-2 text-xs text-gray-500">
              Swapping and adding exercises need your gym profile. Reconnect to load it; logging
              works offline.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setNoteFor('session')}>
              <StickyNote aria-hidden="true" />
              Workout note
            </Button>
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirm('discard')}
            >
              <Trash2 aria-hidden="true" />
              Discard workout
            </Button>
          </div>
          <div className="lg:hidden">
            <SyncIndicator />
          </div>

          <RestTimerBar />
        </div>
      </div>

      {/* ⋯ menu */}
      <Sheet
        open={actionsSe !== null}
        onClose={() => setActionsFor(null)}
        title={actionsSe ? (lookup(actionsSe.exerciseId)?.name ?? 'Exercise') : 'Exercise'}
        description="Changes apply to this workout only."
        size="sm"
      >
        {actionsSe && (
          <ul className="px-3 pb-4" data-testid="gym-exercise-actions-sheet">
            <ActionItem
              icon={Repeat}
              label="Swap exercise"
              disabled={!canPrescribe}
              onClick={() => {
                setActionsFor(null);
                setPicker({ kind: 'swap', seId: actionsSe.id });
              }}
            />
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
                const sets = workingSets(actionsSe);
                const last = sets[sets.length - 1];
                if (last) act({ type: 'removeSet', seId: actionsSe.id, setId: last.id });
                setActionsFor(null);
              }}
            />
            <ActionItem
              icon={ArrowUp}
              label="Move up"
              disabled={actionsSe.position === 0}
              onClick={() => act({ type: 'moveExercise', seId: actionsSe.id, direction: 'up' })}
            />
            <ActionItem
              icon={ArrowDown}
              label="Move down"
              disabled={actionsSe.position >= exercises.length - 1}
              onClick={() => act({ type: 'moveExercise', seId: actionsSe.id, direction: 'down' })}
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
        open={noteFor !== null}
        title={noteFor === 'session' ? 'Workout note' : 'Exercise note'}
        initial={noteFor === 'session' ? (session.notes ?? '') : (noteSe?.notes ?? '')}
        max={noteFor === 'session' ? 1000 : 500}
        onClose={() => setNoteFor(null)}
        onSave={(text) => {
          const notes = text.trim() === '' ? null : text.trim();
          act({ type: 'setNote', seId: noteFor === 'session' ? null : noteFor, notes });
          setNoteFor(null);
        }}
      />

      {data && (
        <ExercisePickerSheet
          open={picker !== null}
          onClose={() => setPicker(null)}
          library={data.library}
          title={picker?.kind === 'swap' ? 'Swap for…' : 'Add an exercise'}
          preferSwapGroup={
            picker?.kind === 'swap'
              ? (lookup(exercises.find((e) => e.id === picker.seId)?.exerciseId ?? '')?.swapGroup ??
                null)
              : null
          }
          {...(picker?.kind === 'swap'
            ? {
                excludeIds: [exercises.find((e) => e.id === picker.seId)?.exerciseId ?? ''],
              }
            : {})}
          onPick={(exercise: ExerciseDto) => {
            if (!picker) return;
            if (picker.kind === 'swap') {
              const action = buildSwapAction({
                doc: session,
                seId: picker.seId,
                meta: exercise,
                bootstrap: data,
                lookup,
                today,
                newId,
              });
              if (action) act(action);
              setSelectedId(picker.seId);
            } else {
              const action = buildAddExerciseAction({
                doc: session,
                meta: exercise,
                bootstrap: data,
                lookup,
                today,
                newId,
              });
              act(action);
              if (action.type === 'addExercise') {
                setSelectedId(action.newSeId);
                setExpanded((prev) => new Set(prev).add(action.newSeId));
              }
            }
            setPicker(null);
          }}
        />
      )}

      <SetMenuSheet
        label={
          setMenu
            ? (() => {
                const se = exercises.find((e) => e.id === setMenu.seId);
                return se ? setLabelOf(se, setMenu.setId) : null;
              })()
            : null
        }
        exerciseName={
          setMenu
            ? (lookup(exercises.find((e) => e.id === setMenu.seId)?.exerciseId ?? '')?.name ??
              'Exercise')
            : ''
        }
        onClose={() => setSetMenu(null)}
        onRemove={() => {
          if (setMenu) act({ type: 'removeSet', seId: setMenu.seId, setId: setMenu.setId });
          setSetMenu(null);
        }}
      />

      <PlateSheet weightKg={plateKg} profile={inventory} onClose={() => setPlateKg(null)} />

      <Sheet
        open={confirm === 'finish'}
        onClose={() => setConfirm(null)}
        title="Finish workout?"
        description={`${unfinishedSets(session)} set${unfinishedSets(session) === 1 ? ' is' : 's are'} not ticked. They won't count, and that's fine.`}
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep going
            </Button>
            <Button
              onClick={() => void doFinish()}
              loading={finishing}
              className="bg-[#944a00] hover:bg-[#7a3d00]"
              data-testid="gym-finish-anyway"
            >
              Finish anyway
            </Button>
          </div>
        }
      >
        <div />
      </Sheet>

      <Sheet
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        title="Discard this workout?"
        description="Nothing from this session will be saved to your history."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                discard();
                setConfirm(null);
                router.replace('/gym');
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <div />
      </Sheet>
    </Frame>
  );
}

function SupersetHeading({ label, restSec }: { label: string; restSec: number }) {
  return (
    <p className="mb-1.5 flex items-center gap-2 px-1 text-sm" data-testid="gym-superset-heading">
      <span className="h-4 w-1 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
      <span className="font-semibold text-violet-800">Superset {label}</span>
      <span className="min-w-0 truncate text-xs text-gray-500">
        {restSec} s rest after each round
      </span>
    </p>
  );
}

/** Per-set menu: remove this set (warm-up or working) from today's workout. */
function SetMenuSheet({
  label,
  exerciseName,
  onClose,
  onRemove,
}: {
  label: string | null;
  exerciseName: string;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <Sheet
      open={label !== null}
      onClose={onClose}
      title={label ? `${label} · ${exerciseName}` : 'Set'}
      description="Changes apply to this workout only."
      size="sm"
    >
      <ul className="px-3 pb-4" data-testid="gym-set-menu-sheet">
        <li>
          <button
            type="button"
            onClick={onRemove}
            data-testid="gym-remove-set"
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Remove {label?.toLowerCase() ?? 'set'}
          </button>
        </li>
      </ul>
    </Sheet>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6">{children}</div>;
}

function WorkoutHeader({
  session,
  done,
  planned,
  onFinish,
  finishing,
}: {
  session: WorkoutSessionDoc;
  done: number;
  planned: number;
  onFinish: () => void;
  finishing: boolean;
}) {
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b bg-gray-50/95 px-4 py-2 backdrop-blur lg:top-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg font-bold text-gray-900">{session.name}</h2>
          <p className="flex flex-wrap gap-x-2 text-xs text-gray-500">
            <ElapsedClock startedAt={session.startedAt} />
            <span aria-label={`${done} of ${planned} sets done`}>
              {done}/{planned} sets
            </span>
            {session.isDeload && <span className="text-sky-700">Deload</span>}
          </p>
        </div>
        <Button
          onClick={onFinish}
          loading={finishing}
          className="shrink-0 bg-[#944a00] hover:bg-[#7a3d00]"
          data-testid="gym-finish"
        >
          Finish
        </Button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${planned > 0 ? (done / planned) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatElapsed(startedAt, now)}</span>;
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-gray-800 hover:bg-gray-100 disabled:opacity-40"
      >
        <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        {label}
      </button>
    </li>
  );
}

function NoteSheet({
  open,
  title,
  initial,
  max,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  max: number;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(text)}>Save note</Button>
        </div>
      }
    >
      <div className="px-5 pb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, max))}
          rows={4}
          placeholder="Seat height, grip, how it felt…"
          className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#944a00]/30"
          aria-label={title}
        />
        <p className="mt-1 text-right text-[11px] text-gray-400">
          {text.length}/{max}
        </p>
      </div>
    </Sheet>
  );
}

/** Live media-query match (false until mounted; the page renders a skeleton until then anyway). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Keeps the screen awake during a workout (Screen Wake Lock API, where supported). */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        // Denied (battery saver, unsupported context) — not important enough to surface.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
