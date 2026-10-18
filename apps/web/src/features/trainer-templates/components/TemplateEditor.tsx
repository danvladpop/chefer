'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ConflictDialog } from '@/features/gym/routine/components/ConflictDialog';
import { DesktopEditorBoard } from '@/features/gym/routine/components/DesktopEditorBoard';
import { ExercisePickerSheet } from '@/features/gym/routine/components/ExercisePickerSheet';
import { PhoneEditorList } from '@/features/gym/routine/components/PhoneEditorList';
import { draftReducer, type DraftAction, type DraftExercise } from '@/features/gym/routine/draft';
import { useUnsavedChangesWarning } from '@/features/gym/routine/use-unsaved-warning';
import { SupersetSheet } from '@/features/gym/shared/superset-sheet';
import { TrainerNoteField } from '@/features/trainer/components/TrainerNoteField';
import { useTrainerUnit } from '@/features/trainer/use-trainer-unit';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, CircleAlert, UsersRound } from 'lucide-react';
import {
  COACHING_COPY,
  TEMPLATE_COPY,
  TRAINER_MODE_LIMITS,
  WORKOUT_TYPE_GROUPS,
  WORKOUT_TYPES,
  type WorkoutTemplateDto,
  type WorkoutType,
} from '@chefer/types';
import { Badge, Button, Sheet } from '@chefer/ui';
import {
  isTemplateSavable,
  outdatedTemplateClientCount,
  supersetSlot,
  takesStartingWeight,
  templateAssignmentStatus,
  templateAssignmentStatusText,
  templateConflictCurrent,
  templateProblems,
  userFacingErrorMessage,
  type ExerciseLookup,
} from '@chefer/utils';
import {
  emptyTemplateDraft,
  fromTemplateDto,
  hasTemplateContent,
  NEW_TEMPLATE_ID,
  templateDocKey,
  toTemplateDoc,
  type TemplateDraft,
} from '../template-draft';
import { AssignTemplateSheet } from './AssignTemplateSheet';
import { DefaultLoadField } from './DefaultLoadField';
import { UpdateClientsSheet } from './UpdateClientsSheet';

// ─── /trainer/workouts/[id]: the template editor (trainer-mode.md §6.6, M2) ───
// The routine editor's own components in the `template` role (one day, no
// day header, curated exercises only) with a starting weight per strength row
// and a note for clients. Autosaves, version-checked: a second tab's save
// opens the routine's "Keep mine / Use the other version" sheet. A new
// template (`/new`) is created on its first save once it holds something,
// and the address becomes its id without remounting the editor.

const copy = TEMPLATE_COPY;
/** Quiet time after the last keystroke before an autosave. */
export const TEMPLATE_AUTOSAVE_MS = 800;
const LIBRARY_HREF = '/trainer/workouts';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** The template is gone or was never the trainer's (the uniform NOT_FOUND). */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  return (error as { data?: { code?: string } }).data?.code === 'NOT_FOUND';
}

/** Keeps each draft row's key but takes the id the server gave it (same rows, same order). */
function adoptServerIds(draft: TemplateDraft, saved: WorkoutTemplateDto): TemplateDraft {
  const day = draft.rows.days[0];
  const rows = saved.exercises.slice().sort((a, b) => a.position - b.position);
  if (day?.exercises.length !== rows.length) return draft;
  if (rows.some((row, i) => row.exerciseId !== day.exercises[i]?.exerciseId)) return draft;
  return {
    ...draft,
    rows: {
      ...draft.rows,
      id: saved.id,
      days: [
        {
          ...day,
          exercises: day.exercises.map((e, i) => {
            const id = rows[i]?.id;
            return id ? { ...e, id } : e;
          }),
        },
      ],
    },
  };
}

export function TemplateEditor({ templateId: initialId }: { templateId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const unit = useTrainerUnit();
  const nameId = useId();
  const nameErrorId = useId();
  const typeId = useId();

  const isNewRoute = initialId === NEW_TEMPLATE_ID;
  const [templateId, setTemplateId] = useState<string | null>(isNewRoute ? null : initialId);
  const [draft, setDraft] = useState<TemplateDraft | null>(() =>
    isNewRoute ? emptyTemplateDraft() : null,
  );
  const [version, setVersion] = useState<number | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<WorkoutTemplateDto | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [supersetOpen, setSupersetOpen] = useState(false);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [updating, setUpdating] = useState(false);

  const templateQuery = trpc.trainer.templates.get.useQuery(
    { templateId: templateId ?? NEW_TEMPLATE_ID },
    { enabled: templateId !== null, retry: false, staleTime: 15_000 },
  );
  const library = trpc.gym.library.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const server = templateId !== null ? (templateQuery.data ?? null) : null;

  // Seed once from the server; a refetch (another tab, an assign) never clobbers edits.
  useEffect(() => {
    if (draft === null && server) {
      const seeded = fromTemplateDto(server);
      setDraft(seeded);
      setVersion(server.version);
      setSavedKey(templateDocKey(toTemplateDoc(seeded)));
    }
  }, [draft, server]);

  const doc = useMemo(() => (draft ? toTemplateDoc(draft) : null), [draft]);
  const docKey = doc ? templateDocKey(doc) : null;
  const problems = doc ? templateProblems(doc) : null;
  const dirty =
    doc !== null && (templateId === null ? hasTemplateContent(doc) : docKey !== savedKey);
  useUnsavedChangesWarning(dirty);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const lookup: ExerciseLookup = useMemo(() => {
    const byId = new Map<string, NonNullable<ReturnType<ExerciseLookup>>>();
    for (const exercise of library.data ?? []) byId.set(exercise.id, exercise);
    for (const exercise of server?.exerciseMeta ?? []) {
      if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
    }
    return (id) => byId.get(id);
  }, [library.data, server?.exerciseMeta]);

  const afterSave = (saved: WorkoutTemplateDto, sentKey: string) => {
    utils.trainer.templates.get.setData({ templateId: saved.id }, saved);
    void utils.trainer.templates.list.invalidate();
    setVersion(saved.version);
    setConflict(null);
    setSaveError(null);
    setFailedKey(null);
    setSaveState('saved');
    const current = draftRef.current;
    if (current && templateDocKey(toTemplateDoc(current)) === sentKey) {
      const adopted = adoptServerIds(current, saved);
      setDraft(adopted);
      setSavedKey(templateDocKey(toTemplateDoc(adopted)));
    } else {
      // Edited while saving: the next autosave sends the rest.
      setSavedKey(sentKey);
    }
  };
  const onSaveError = (err: unknown, sentKey: string) => {
    const current = templateConflictCurrent(err);
    if (current) {
      setConflict(current);
      setSaveState('idle');
      return;
    }
    setFailedKey(sentKey);
    setSaveError(userFacingErrorMessage(err));
    setSaveState('error');
  };

  const create = trpc.trainer.templates.create.useMutation({ meta: { silent: true } });
  const save = trpc.trainer.templates.save.useMutation({ meta: { silent: true } });
  const inFlight = create.isPending || save.isPending;

  const runSave = useCallback(
    (expectedVersion?: number) => {
      const current = draftRef.current;
      if (!current) return;
      const sent = toTemplateDoc(current);
      if (!isTemplateSavable(sent)) return;
      const sentKey = templateDocKey(sent);
      if (templateId === null) {
        if (!hasTemplateContent(sent)) return;
        setSaveState('saving');
        create.mutate(sent, {
          onSuccess: (created) => {
            capture('template_created', {});
            setTemplateId(created.id);
            afterSave(created, sentKey);
            // The address becomes the template's without remounting (no lost keystrokes).
            window.history.replaceState(
              null,
              '',
              `${LIBRARY_HREF}/${encodeURIComponent(created.id)}`,
            );
          },
          onError: (err) => onSaveError(err, sentKey),
        });
        return;
      }
      const v = expectedVersion ?? version;
      if (v === null) return;
      setSaveState('saving');
      save.mutate(
        { templateId, template: sent, expectedVersion: v },
        {
          onSuccess: (saved) => afterSave(saved, sentKey),
          onError: (err) => onSaveError(err, sentKey),
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable per tRPC; the draft is read from its ref
    [templateId, version],
  );

  // Debounced, versioned autosave.
  useEffect(() => {
    if (!doc || !docKey || inFlight || conflict) return;
    if (docKey === failedKey || !isTemplateSavable(doc)) return;
    if (templateId === null ? !hasTemplateContent(doc) : docKey === savedKey) return;
    const timer = setTimeout(() => runSave(), TEMPLATE_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [doc, docKey, inFlight, conflict, failedKey, savedKey, templateId, runSave]);

  const remove = trpc.trainer.templates.delete.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setDeleting(false);
      void utils.trainer.templates.list.invalidate();
      router.push(LIBRARY_HREF);
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  const dispatch = useCallback((action: DraftAction) => {
    setDraft((prev) => (prev ? { ...prev, rows: draftReducer(prev.rows, action) } : prev));
  }, []);

  const header = (title: string) => (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={LIBRARY_HREF}
        aria-label={copy.library.title}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
      <h1 className="min-w-0 break-words font-serif text-2xl font-bold text-gray-900">{title}</h1>
    </div>
  );
  const frame = (children: React.ReactNode, title: string) => (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {header(title)}
      {children}
    </div>
  );

  if (templateId !== null && templateQuery.isError && !server) {
    return frame(
      <div role="alert" className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
        <p>
          {isNotFound(templateQuery.error)
            ? copy.server.notFound
            : userFacingErrorMessage(templateQuery.error)}
        </p>
        {!isNotFound(templateQuery.error) && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void templateQuery.refetch()}
          >
            {COACHING_COPY.common.retry}
          </Button>
        )}
      </div>,
      copy.editor.title,
    );
  }
  if (!draft || !doc || !problems) {
    return frame(
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />,
      copy.editor.title,
    );
  }

  const rows = draft.rows.days[0]?.exercises ?? [];
  const dayKey = draft.rows.days[0]?.key ?? '';
  const max = TRAINER_MODE_LIMITS.exercisesPerTemplate;
  const atLimit = rows.length >= max;
  const showNameError = nameTouched && (problems.nameMissing || problems.nameTooLong);
  const assignments = server?.assignments ?? [];
  const outdated = outdatedTemplateClientCount(assignments);
  const saved = templateId !== null && !dirty && !inFlight;

  const renderExtra = (rowDayKey: string, exercise: DraftExercise) => {
    const meta = lookup(exercise.exerciseId);
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {takesStartingWeight(meta) && (
          <DefaultLoadField
            valueKg={exercise.defaultLoadKg}
            unit={unit}
            exerciseName={meta?.name ?? exercise.exerciseId}
            onChange={(kg) =>
              dispatch({
                type: 'update_exercise',
                dayKey: rowDayKey,
                exerciseKey: exercise.key,
                patch: { defaultLoadKg: kg },
              })
            }
          />
        )}
        <TrainerNoteField
          clientName=""
          label={copy.editor.note}
          hint={COACHING_COPY.trainer.noteForClientHint('Clients')}
          value={exercise.trainerNote ?? ''}
          onChange={(value) =>
            dispatch({
              type: 'update_exercise',
              dayKey: rowDayKey,
              exerciseKey: exercise.key,
              patch: { trainerNote: value },
            })
          }
        />
      </div>
    );
  };

  const swapExerciseId = swapKey ? rows.find((e) => e.key === swapKey)?.exerciseId : undefined;
  const supersetItems = rows.map((exercise, index) => {
    const slot = supersetSlot(rows, index);
    return {
      id: exercise.key,
      name: lookup(exercise.exerciseId)?.name ?? exercise.exerciseId,
      badge: slot ? `${slot.label}${slot.position + 1}` : null,
    };
  });

  const failed = saveState === 'error' && docKey === failedKey;
  const pending = inFlight || (dirty && isTemplateSavable(doc) && !failed);
  const status = failed
    ? (saveError ?? copy.editor.saveFailed)
    : pending
      ? copy.editor.saving
      : saved
        ? copy.editor.saved
        : null;

  const editorProps = {
    draft: draft.rows,
    dispatch,
    lookup,
    role: 'template' as const,
    exerciseLimit: max,
    onAddDay: () => undefined,
    onOpenPicker: () => setPickerOpen(true),
    onOpenSuperset: () => setSupersetOpen(true),
    onSwap: (_day: string, exerciseKey: string) => setSwapKey(exerciseKey),
    renderExtra,
  };

  return frame(
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className={saveState === 'error' ? 'text-sm text-red-700' : 'text-sm text-gray-500'}
          data-testid="template-save-status"
        >
          {status}
        </p>
        {templateId !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="min-h-11"
              onClick={() => setAssigning(true)}
              disabled={dirty || inFlight || (rows.length === 0 && draft.workoutType === null)}
            >
              <UsersRound className="h-4 w-4" aria-hidden="true" /> {copy.assign.action}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-red-700"
              onClick={() => setDeleting(true)}
            >
              {copy.editor.delete}
            </Button>
          </div>
        )}
      </div>

      {outdated > 0 && (
        <section
          aria-label={copy.update.banner(outdated)}
          className="flex min-w-0 flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="template-outdated-banner"
        >
          <p className="flex min-w-0 items-center gap-2 font-medium text-amber-950">
            <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{copy.update.banner(outdated)}</span>
          </p>
          <Button
            type="button"
            className="min-h-11 shrink-0 self-start sm:self-auto"
            disabled={dirty || inFlight}
            onClick={() => setUpdating(true)}
          >
            {copy.update.action}
          </Button>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={nameId} className="text-sm font-medium text-gray-700">
            {copy.editor.name}
          </label>
          <input
            id={nameId}
            type="text"
            value={draft.name}
            placeholder={copy.editor.namePlaceholder}
            maxLength={TRAINER_MODE_LIMITS.templateNameMaxChars}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onBlur={() => setNameTouched(true)}
            aria-invalid={showNameError ? true : undefined}
            aria-describedby={showNameError ? nameErrorId : undefined}
            className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          />
          {showNameError && (
            <p id={nameErrorId} role="alert" className="text-xs text-red-700">
              {problems.nameMissing
                ? copy.editor.nameRequired
                : `Keep the name to ${TRAINER_MODE_LIMITS.templateNameMaxChars} characters.`}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={typeId} className="text-sm font-medium text-gray-700">
            {copy.editor.workoutType}
          </label>
          <select
            id={typeId}
            value={draft.workoutType ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                workoutType: e.target.value === '' ? null : (e.target.value as WorkoutType),
              })
            }
            className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          >
            <option value="">{copy.editor.noWorkoutType}</option>
            {WORKOUT_TYPE_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.label}>
                {WORKOUT_TYPES.filter((t) => t.group === group.group).map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <section aria-labelledby="template-exercises" className="flex min-w-0 flex-col gap-2">
        <h2 id="template-exercises" className="font-semibold text-gray-900">
          {copy.editor.exercises}
        </h2>
        <p className="text-xs text-gray-500">{copy.editor.curatedOnly}</p>
        <div className="hidden lg:block">
          <DesktopEditorBoard {...editorProps} />
        </div>
        <PhoneEditorList {...editorProps} />
        {atLimit && (
          <p className="text-sm text-amber-800" data-testid="template-exercise-limit">
            {copy.editor.exerciseLimit(max)}
          </p>
        )}
      </section>

      {assignments.length > 0 && (
        <section aria-labelledby="template-assigned" className="flex min-w-0 flex-col gap-2">
          <h2 id="template-assigned" className="font-semibold text-gray-900">
            {copy.library.assigned(assignments.length)}
          </h2>
          <ul className="flex flex-col divide-y divide-gray-100 rounded-2xl border bg-white px-4">
            {assignments.map((a) => {
              const state = templateAssignmentStatus(a);
              return (
                <li
                  key={`${a.clientId}-${a.routineDayId}`}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
                  data-testid="template-assignment"
                >
                  <span className="min-w-0">
                    <span className="block min-w-0 break-words text-sm font-medium text-gray-900">
                      {a.clientName}
                    </span>
                    <span className="block min-w-0 break-words text-xs text-gray-500">
                      {a.dayName}
                    </span>
                  </span>
                  <Badge variant={state === 'upToDate' ? 'secondary' : 'info'} className="shrink-0">
                    {templateAssignmentStatusText(a)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ExercisePickerSheet
        open={pickerOpen || swapKey !== null}
        onClose={() => {
          setPickerOpen(false);
          setSwapKey(null);
        }}
        library={library.data ?? []}
        curatedOnly
        title={swapKey ? 'Swap exercise' : 'Add exercise'}
        preferSwapGroup={swapExerciseId ? lookup(swapExerciseId)?.swapGroup : null}
        excludeIds={swapExerciseId ? [swapExerciseId] : []}
        onPick={(exercise) => {
          if (swapKey) {
            dispatch({
              type: 'swap_exercise',
              dayKey,
              exerciseKey: swapKey,
              newExerciseId: exercise.id,
            });
            // A starting weight belongs to the exercise it was set for.
            dispatch({
              type: 'update_exercise',
              dayKey,
              exerciseKey: swapKey,
              patch: { defaultLoadKg: null },
            });
            setSwapKey(null);
          } else if (!atLimit) {
            dispatch({ type: 'add_exercise', dayKey, exercise });
            setPickerOpen(false);
          }
        }}
      />

      <SupersetSheet
        open={supersetOpen}
        onClose={() => setSupersetOpen(false)}
        items={supersetItems}
        onGroup={(exerciseKeys) => {
          dispatch({ type: 'create_superset', dayKey, exerciseKeys });
          setSupersetOpen(false);
        }}
      />

      <ConflictDialog
        open={conflict !== null}
        subject="template"
        saving={save.isPending}
        onUseTheirs={() => {
          if (!conflict) return;
          const seeded = fromTemplateDto(conflict);
          utils.trainer.templates.get.setData({ templateId: conflict.id }, conflict);
          setDraft(seeded);
          setVersion(conflict.version);
          setSavedKey(templateDocKey(toTemplateDoc(seeded)));
          setConflict(null);
          setSaveState('idle');
        }}
        onKeepMine={() => {
          if (!conflict) return;
          const expected = conflict.version;
          setConflict(null);
          setVersion(expected);
          runSave(expected);
        }}
      />

      <Sheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={copy.editor.deleteTitle}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(false)}
              disabled={remove.isPending}
            >
              {COACHING_COPY.common.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => templateId && remove.mutate({ templateId })}
              loading={remove.isPending}
            >
              {copy.editor.delete}
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-sm text-gray-600">{copy.editor.deleteBody}</p>
      </Sheet>

      {server && (
        <>
          <AssignTemplateSheet
            open={assigning}
            onClose={() => setAssigning(false)}
            template={server}
          />
          <UpdateClientsSheet
            open={updating}
            onClose={() => setUpdating(false)}
            template={server}
          />
        </>
      )}
    </>,
    templateId === null ? copy.editor.newTitle : (server?.name ?? copy.editor.title),
  );
}
