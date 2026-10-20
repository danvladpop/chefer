import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import {
  COACHING_COPY,
  TEMPLATE_COPY,
  TRAINER_MODE_LIMITS,
  type ExerciseMeta,
} from '@chefer/types';
import {
  Button,
  ConfirmSheet,
  DONE_FIELD_PROPS,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  PressableScale,
  Screen,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  templateAssignmentStatusText,
  templateProblems,
  userFacingErrorMessage,
  workoutTypeLabel,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useUnsavedGuard } from '../../../lib/use-unsaved-guard';
import { useViewerUnits } from '../../friends/profile/use-viewer-units';
import { ExercisePicker } from '../../gym/library/exercise-picker';
import { newId } from '../../gym/offline/ids';
import { DayEditor } from '../../gym/routine/day-editor';
import { WorkoutTypePickerSheet } from '../../gym/simple/workout-type-chips';
import { isClientUnavailable } from '../../trainer/client/use-trainer-client';
import { goBackOrHome, TrainerHeader } from '../../trainer/components/trainer-header';
import { AssignTemplateSheet } from './assign-sheet';
import { TemplateConflictSheet } from './template-conflict-sheet';
import { draftToTemplateDoc, TEMPLATE_DAY_KEY } from './template-draft';
import { UpdateClientsSheet } from './update-clients-sheet';
import { useTemplateEditor, type TemplateSaveStatus } from './use-template-editor';

// ─── The template editor (trainer-mode.md §6.6, M2) ───────────────────────────
// A name (≤ 40, required to save), an optional workout type and the exercises in the shared routine
// `DayEditor` (template role: sets, reps, rest, RIR, superset, "Note for clients", "Starting weight";
// Chefer library exercises only, 20 at most). Autosaved ("Saving…" / "Saved"), version-checked.
// "Assign to clients" opens the assign sheet; "⋯" → Delete template. Once assigned: who has it, and
// a banner with "Update for clients" when some have an older version.

const COPY = TEMPLATE_COPY.editor;
const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

type PickerState = { mode: 'add' } | { mode: 'swap'; exerciseKey: string };

function statusText(status: TemplateSaveStatus): string | null {
  if (status === 'saving') return COPY.saving;
  if (status === 'saved') return COPY.saved;
  if (status === 'error') return COPY.notSaved;
  return null;
}

export function TemplateEditorScreen({ templateId: initialId }: { templateId: string | null }) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const unit = useViewerUnits().weight;
  const editor = useTemplateEditor(initialId);
  const { draft, dispatch, server, templateId } = editor;
  const libraryQuery = trpc.gym.library.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const remove = trpc.trainer.templates.delete.useMutation({ meta: { silent: true } });

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  // iOS cannot present a sheet while another one is still dismissing: the menu's action runs on exit.
  const afterMenu = useRef<(() => void) | null>(null);

  const day = draft.days[0];
  const exercises = day?.exercises ?? [];
  // An unnamed template is never saved: leaving one that has exercises asks first.
  const unnamedWork =
    templateProblems(draftToTemplateDoc(draft)).nameMissing && exercises.length > 0;
  const guard = useUnsavedGuard(unnamedWork || editor.status === 'error', {
    title: 'Discard this template?',
    message: unnamedWork
      ? 'It has no name yet, so it hasn’t been saved.'
      : 'Your last changes haven’t been saved.',
  });

  const library = libraryQuery.data ?? [];
  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseMeta>();
    for (const e of library) byId.set(e.id, e);
    for (const e of server?.exerciseMeta ?? []) byId.set(e.id, e);
    return (id: string) => byId.get(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `library` is derived from libraryQuery.data
  }, [libraryQuery.data, server]);

  const swapExercise =
    picker?.mode === 'swap' ? exercises.find((e) => e.key === picker.exerciseKey) : undefined;
  const preferSwapGroup = swapExercise
    ? (lookup(swapExercise.exerciseId)?.swapGroup ?? null)
    : null;

  const assignments = server?.assignments ?? [];
  const outdated = assignments.filter((a) => a.outdated).length;
  const title =
    draft.name.trim() !== '' ? draft.name.trim() : templateId ? COPY.title : COPY.newTitle;
  const status = statusText(editor.status);

  const header = (
    <TrainerHeader
      testID="template-editor-header"
      title={title}
      onBack={goBackOrHome}
      right={
        <View className="flex-row items-center gap-1">
          {status ? (
            <Text
              testID="template-editor-status"
              accessibilityLiveRegion="polite"
              className="text-caption text-label-secondary"
            >
              {status}
            </Text>
          ) : null}
          {templateId ? (
            <IconButton
              testID="template-editor-menu"
              accessibilityLabel="Template options"
              icon={<Icon name="more" color={colors.labelSecondary} size={22} />}
              onPress={() => setMenuOpen(true)}
              className="-mr-2"
            />
          ) : null}
        </View>
      }
    />
  );

  if (editor.isLoading) {
    return (
      <Screen edges={SCREEN_EDGES} className="bg-canvas px-0">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="template-editor-loading" />
        </View>
      </Screen>
    );
  }
  if (editor.loadError && !server) {
    return (
      <Screen edges={SCREEN_EDGES} className="bg-canvas px-0">
        {header}
        {isClientUnavailable(editor.loadError) ? (
          <EmptyState
            testID="template-editor-unavailable"
            title={TEMPLATE_COPY.server.notFound}
            action={{
              label: 'Back to templates',
              testID: 'template-editor-unavailable-back',
              onPress: goBackOrHome,
            }}
          />
        ) : (
          <ErrorState testID="template-editor-error" onRetry={editor.retryLoad} />
        )}
      </Screen>
    );
  }

  const openAssign = async () => {
    // Assign copies what the server has: save pending edits first.
    await editor.flush();
    setAssignOpen(true);
  };

  return (
    <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="template-editor">
      {header}
      <KeyboardAwareScrollView
        testID="template-editor-scroll"
        contentContainerClassName="gap-4 px-4 py-4"
        footer={
          <View className="border-t border-separator bg-canvas px-4 pb-2 pt-3">
            <Button
              testID="template-editor-assign"
              disabled={templateId === null || exercises.length === 0}
              onPress={() => void openAssign()}
            >
              {TEMPLATE_COPY.assign.action}
            </Button>
          </View>
        }
      >
        {editor.status === 'error' ? (
          <View
            testID="template-editor-save-error"
            className="flex-row items-center gap-2 rounded-control bg-surface-sunken px-3 py-2"
          >
            <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
              {COPY.saveFailed}
            </Text>
            <PressableScale
              testID="template-editor-retry"
              accessibilityRole="button"
              onPress={() => void editor.flush()}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-callout font-semibold text-brand">
                {COACHING_COPY.common.tryAgain}
              </Text>
            </PressableScale>
          </View>
        ) : null}

        {outdated > 0 ? (
          <View
            testID="template-editor-outdated"
            className="gap-2 rounded-card border border-separator bg-surface p-4"
          >
            <Text className="text-subhead text-label">{TEMPLATE_COPY.update.banner(outdated)}</Text>
            <Button
              testID="template-editor-update"
              variant="outline"
              onPress={() => setUpdateOpen(true)}
            >
              {TEMPLATE_COPY.update.action}
            </Button>
          </View>
        ) : null}

        <View className="gap-1">
          <Input
            testID="template-editor-name"
            label={COPY.name}
            value={draft.name}
            maxLength={TRAINER_MODE_LIMITS.templateNameMaxChars}
            placeholder={COPY.namePlaceholder}
            onChangeText={(name) => dispatch({ type: 'renameRoutine', name })}
            {...DONE_FIELD_PROPS}
          />
          {unnamedWork ? (
            <Text
              testID="template-editor-name-needed"
              className="text-caption text-label-secondary"
            >
              {COPY.nameRequired}
            </Text>
          ) : null}
        </View>

        <ListSection>
          <ListRow
            testID="template-editor-type"
            title={COPY.workoutType}
            value={day?.workoutType ? workoutTypeLabel(day.workoutType) : COPY.noWorkoutType}
            onPress={() => setTypeOpen(true)}
          />
        </ListSection>

        <Text testID="template-editor-curated" className="text-caption text-label-secondary">
          {COPY.curatedOnly}
        </Text>

        {day ? (
          <DayEditor
            day={day}
            index={0}
            dayCount={1}
            lookup={lookup}
            dispatch={dispatch}
            onAddExercise={() => setPicker({ mode: 'add' })}
            onSwapExercise={(_dayKey, exerciseKey) => setPicker({ mode: 'swap', exerciseKey })}
            coaching={{ role: 'template', unit }}
          />
        ) : null}

        {assignments.length > 0 ? (
          <View testID="template-editor-assigned" className="gap-2">
            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              {TEMPLATE_COPY.library.assigned(assignments.length)}
            </Text>
            <ListSection>
              {assignments.map((a) => (
                <ListRow
                  key={a.clientId}
                  testID={`template-editor-assigned-${a.clientId}`}
                  title={a.clientName}
                  subtitle={`${a.dayName} · ${templateAssignmentStatusText(a)}`}
                  onPress={() => router.push(`/trainer/${a.clientId}`)}
                />
              ))}
            </ListSection>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <WorkoutTypePickerSheet
        testID="template-editor-type-picker"
        visible={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={COPY.workoutType}
        initial={day?.workoutType ?? null}
        includeStrength
        includeRest
        restLabel={COPY.noWorkoutType}
        onPick={(workoutType) => {
          dispatch({ type: 'setWorkoutType', dayKey: TEMPLATE_DAY_KEY, workoutType });
          setTypeOpen(false);
        }}
      />

      <ExercisePicker
        testID="template-editor-picker"
        visible={picker !== null}
        onClose={() => setPicker(null)}
        library={library}
        curatedOnly
        excludeIds={exercises.map((e) => e.exerciseId)}
        preferSwapGroup={preferSwapGroup}
        title={picker?.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}
        onPick={(exercise) => {
          if (!picker) return;
          if (picker.mode === 'add') {
            dispatch({
              type: 'addExercise',
              dayKey: TEMPLATE_DAY_KEY,
              newExerciseKey: newId(),
              exercise,
            });
          } else {
            dispatch({
              type: 'swapExercise',
              dayKey: TEMPLATE_DAY_KEY,
              exerciseKey: picker.exerciseKey,
              exercise,
            });
          }
          setPicker(null);
        }}
      />

      <Sheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onExited={() => {
          const next = afterMenu.current;
          afterMenu.current = null;
          next?.();
        }}
        title={title}
        testID="template-editor-menu-sheet"
      >
        <ListSection>
          <ListRow
            testID="template-editor-delete"
            title={COPY.delete}
            destructive
            accessory="none"
            onPress={() => {
              afterMenu.current = () => setDeleteOpen(true);
              setMenuOpen(false);
            }}
          />
        </ListSection>
      </Sheet>

      <ConfirmSheet
        testID="template-editor-delete-confirm"
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={COPY.deleteTitle}
        body={COPY.deleteBody}
        confirmLabel={COPY.delete}
        cancelLabel="Cancel"
        destructive
        busy={remove.isPending}
        error={remove.error ? userFacingErrorMessage(remove.error) : null}
        onConfirm={() => {
          if (!templateId) return;
          editor.stop();
          remove.mutate(
            { templateId },
            {
              onSuccess: () => {
                setDeleteOpen(false);
                void utils.trainer.templates.list.invalidate();
                guard.release();
                goBackOrHome();
              },
            },
          );
        }}
      />

      <TemplateConflictSheet
        current={editor.conflict}
        onClose={() => undefined}
        onKeepMine={editor.keepMine}
        onUseTheirs={editor.loadTheirs}
      />

      {templateId ? (
        <AssignTemplateSheet
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          template={{ id: templateId, name: draft.name.trim() }}
        />
      ) : null}

      <UpdateClientsSheet
        visible={updateOpen}
        onClose={() => setUpdateOpen(false)}
        template={server}
      />

      <ConfirmSheet testID="template-editor-discard" {...guard.sheetProps} />
    </Screen>
  );
}
