import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { GymBootstrap, RoutineListItemDto, TemplateSummaryDto } from '@chefer/types';
import {
  ConfirmSheet,
  DONE_FIELD_PROPS,
  ErrorState,
  IconButton,
  Input,
  keyboardDismissMode,
  ListRow,
  ListSection,
  Screen,
  Sheet,
  Stepper,
  Text,
  useQueryState,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../src/components/icon';
import { ArchivedRoutines } from '../../src/features/gym/routine/archived-routines';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
import { buildTemplatePreview } from '../../src/features/gym/setup/template-preview';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { useSaveGymProfile } from '../../src/features/gym/use-save-gym-profile';
import { ShellChromeProvider, ShellTopBar } from '../../src/features/shell/shell-chrome';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { TrainButton } from '../../src/features/shell/train/train-button';
import { TrainCard } from '../../src/features/shell/train/train-cards';
import { trpc } from '../../src/lib/trpc';

// My routines (gym_plan.md §1.3 "Routine tab" routine switcher): create from
// a template or from scratch, set active, duplicate, archive (Undo for 10 s, and an
// "Archived" section with Restore afterwards). All online-only.

/** The small brand pill MediaRow uses for "Up next" (10 Oct redesign). */
function Pill({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text
      testID={testID}
      className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
    >
      {children}
    </Text>
  );
}

function RoutineRow({
  routine,
  onSetActive,
  onMore,
  disabled,
}: {
  routine: RoutineListItemDto;
  onSetActive: () => void;
  onMore: () => void;
  disabled: boolean;
}) {
  const colors = useThemeColors();
  return (
    <TrainCard testID={`routine-list-item-${routine.id}`}>
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text numberOfLines={1} className="shrink text-headline font-semibold text-label">
              {routine.name}
            </Text>
            {routine.isActive ? (
              <Pill testID={`routine-list-item-${routine.id}-active`}>Active</Pill>
            ) : null}
          </View>
          <Text className="text-subhead text-label-secondary">
            {routine.dayCount} {routine.dayCount === 1 ? 'day' : 'days'}
          </Text>
        </View>
        {/* UX-GYM-15: Archive (and Duplicate) live in a ⋯ menu, so the destructive
            action is no longer one slip away from "Set active". */}
        <IconButton
          testID={`routine-list-item-${routine.id}-more`}
          accessibilityLabel={`More actions for ${routine.name}`}
          disabled={disabled}
          onPress={onMore}
          className="-mr-2 -mt-2"
          icon={<Icon name="more" color={colors.labelSecondary} size={22} />}
        />
      </View>
      {!routine.isActive ? (
        <TrainButton
          testID={`routine-list-item-${routine.id}-set-active`}
          label="Set active"
          icon="checkmarkCircle"
          variant="tinted"
          className="self-start"
          disabled={disabled}
          onPress={onSetActive}
        />
      ) : null}
    </TrainCard>
  );
}

function TemplateRow({
  template,
  onPreview,
  disabled,
}: {
  template: TemplateSummaryDto;
  onPreview: () => void;
  disabled: boolean;
}) {
  return (
    <TrainCard testID={`gym-routines-template-${template.key}`}>
      <View className="gap-0.5">
        <Text className="text-headline font-semibold text-label">{template.name}</Text>
        <Text className="text-caption text-label-secondary">
          {template.daysPerWeek}×/week ·{' '}
          {template.experience === 'BEGINNER' ? 'Beginner' : 'Experienced'}
        </Text>
      </View>
      <Text className="text-subhead text-label-secondary">{template.description}</Text>
      <TrainButton
        testID={`gym-routines-template-${template.key}-preview`}
        label="Preview"
        variant="outline"
        className="self-start"
        disabled={disabled}
        onPress={onPreview}
      />
    </TrainCard>
  );
}

/** UX-GYM-14: what a template contains, day by day, before it is created. */
function TemplatePreviewBody({
  template,
  currentGoal,
  hasActive,
  preview,
}: {
  template: TemplateSummaryDto;
  currentGoal: number | null;
  hasActive: boolean;
  preview: ReturnType<typeof buildTemplatePreview> | null;
}) {
  return (
    <View className="gap-3" testID="gym-routines-template-preview">
      <Text className="text-subhead text-label-secondary">
        {template.daysPerWeek}×/week · {template.description}
      </Text>
      {hasActive ? (
        <Text
          testID="gym-routines-template-preview-switch-note"
          className="rounded-control bg-surface-sunken px-3 py-2 text-subhead text-label"
        >
          {currentGoal !== null && currentGoal !== template.daysPerWeek
            ? `“Create and switch” makes this your active routine and changes your weekly goal from ${String(currentGoal)} to ${String(template.daysPerWeek)}. “Create” keeps your current routine active.`
            : '“Create and switch” makes this your active routine. “Create” keeps your current routine active.'}
        </Text>
      ) : null}
      {preview ? (
        preview.days.map((day, i) => (
          <TrainCard
            key={`${day.name}-${String(i)}`}
            testID={`gym-routines-template-preview-day-${String(i)}`}
            className="gap-1.5"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="min-w-0 flex-1 text-headline font-semibold text-label"
                numberOfLines={1}
              >
                {day.name}
              </Text>
              <Text className="text-caption text-label-secondary">~{day.estimatedMin} min</Text>
            </View>
            {day.exercises.map((ex) => (
              <View key={ex.exerciseId} className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 text-subhead text-label" numberOfLines={1}>
                  {ex.name}
                </Text>
                <Text className="text-caption text-label-secondary">
                  {ex.sets} ×{' '}
                  {ex.repMin === ex.repMax
                    ? ex.repMin
                    : `${String(ex.repMin)}-${String(ex.repMax)}`}
                </Text>
              </View>
            ))}
          </TrainCard>
        ))
      ) : (
        <Text
          testID="gym-routines-template-preview-unavailable"
          className="text-subhead text-label-secondary"
        >
          The day-by-day preview isn’t available for this program.
        </Text>
      )}
    </View>
  );
}

// 10 Oct redesign: a pushed page under the shell's top bar (brand Back +
// title1), on the canvas, with TrainCards — the look of Routine / Training
// settings. The route wraps the screen in its own chrome so the top bar shows
// in both shells; Back falls back to the shell's Routine page.
export default function GymRoutinesRoute() {
  const shellV2 = useShellV2();
  return (
    <ShellChromeProvider
      value={{
        kind: 'pushed',
        fallback: shellV2 ? '/training/routine' : '/routine',
        title: 'My routines',
      }}
    >
      <GymRoutinesScreen />
    </ShellChromeProvider>
  );
}

function GymRoutinesScreen() {
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const listQuery = trpc.gym.routine.list.useQuery();
  const templatesQuery = trpc.gym.routine.templates.useQuery(undefined, { enabled: false });

  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  // UX-GYM-14: the template being previewed (inside the template sheet).
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [blankSheetOpen, setBlankSheetOpen] = useState(false);
  const [blankName, setBlankName] = useState('');
  const [blankDays, setBlankDays] = useState(3);
  // UX-GYM-22 / X-13: archive is confirmed in a ConfirmSheet (not a native
  // Alert) so a failure shows in the sheet instead of vanishing.
  const [archiveTarget, setArchiveTarget] = useState<RoutineListItemDto | null>(null);
  // UX-GYM-15: Duplicate / Archive live in a ⋯ menu per routine.
  const [menuTarget, setMenuTarget] = useState<RoutineListItemDto | null>(null);
  const afterMenuExit = useRef<(() => void) | null>(null);
  const listState = useQueryState(listQuery);
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  // The weekly goal follows the routine you switch to (UX-GYM-14); a failure shows
  // through the default mutation snackbar.
  const saveProfile = useSaveGymProfile();

  const invalidateAll = () => {
    void utils.gym.routine.list.invalidate();
    void utils.gym.bootstrap.invalidate();
  };

  const setActiveMutation = trpc.gym.routine.setActive.useMutation({ onSuccess: invalidateAll });
  const duplicateMutation = trpc.gym.routine.duplicate.useMutation({ onSuccess: invalidateAll });
  // UX-GYM-34: a failed restore reaches the user through the default mutation snackbar.
  const restoreMutation = trpc.gym.routine.restore.useMutation({ onSuccess: invalidateAll });
  const archiveMutation = trpc.gym.routine.archive.useMutation({
    onSuccess: () => {
      invalidateAll();
      const archived = archiveTarget;
      setArchiveTarget(null);
      if (!archived) return;
      // Archiving can be undone for 10 s, and from the "Archived" section afterwards.
      // Undoing the ACTIVE routine makes it active again (setActive also un-archives).
      snackbar.show({
        message: `Archived “${archived.name}”.`,
        actionLabel: 'Undo',
        onAction: () => {
          if (archived.isActive) setActiveMutation.mutate({ id: archived.id });
          else restoreMutation.mutate({ id: archived.id });
        },
      });
    },
    // The ConfirmSheet shows the failure itself.
    meta: { silent: true },
  });
  const createFromTemplateMutation = trpc.gym.routine.createFromTemplate.useMutation({
    onSuccess: (created, variables) => {
      invalidateAll();
      setTemplateSheetOpen(false);
      setPreviewKey(null);
      if (!variables.setActive) {
        snackbar.show({ message: `Created “${created.name}”. Your active routine is unchanged.` });
        return;
      }
      const goal = (templatesQuery.data ?? []).find(
        (t) => t.key === variables.templateKey,
      )?.daysPerWeek;
      const current =
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.profile?.weeklyGoal;
      if (goal !== undefined && current !== undefined && goal !== current) {
        saveProfile.mutate({ weeklyGoal: goal });
        snackbar.show({
          message: `Switched to “${created.name}”. Weekly goal is now ${String(goal)}.`,
        });
      } else {
        snackbar.show({ message: `Switched to “${created.name}”.` });
      }
    },
  });
  const createBlankMutation = trpc.gym.routine.createBlank.useMutation({
    onSuccess: () => {
      invalidateAll();
      setBlankSheetOpen(false);
      setBlankName('');
      setBlankDays(3);
    },
  });

  const busy =
    setActiveMutation.isPending ||
    duplicateMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending;

  const openTemplateSheet = () => {
    setPreviewKey(null);
    setTemplateSheetOpen(true);
    void templatesQuery.refetch();
  };

  const confirmArchive = (routine: RoutineListItemDto) => {
    archiveMutation.reset();
    setArchiveTarget(routine);
  };

  const previewTemplate = (templatesQuery.data ?? []).find((t) => t.key === previewKey) ?? null;
  const profile = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.profile ?? null;
  const preview = useMemo(() => {
    if (!previewTemplate) return null;
    try {
      return buildTemplatePreview(
        previewTemplate.key,
        profile?.equipmentAccess ?? 'FULL_GYM',
        profile?.experience ?? 'INTERMEDIATE',
      );
    } catch {
      return null;
    }
  }, [previewTemplate, profile?.equipmentAccess, profile?.experience]);
  const hasActive = (listQuery.data ?? []).some((r) => r.isActive && !r.archived);
  const liveRoutines = (listQuery.data ?? []).filter((r) => !r.archived);
  const archivedRoutines = (listQuery.data ?? []).filter((r) => r.archived);

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode()}
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
      >
        <View testID="gym-routines-title">
          <ShellTopBar />
        </View>

        {!isOnline ? (
          <Text
            testID="gym-routines-offline-banner"
            className="rounded-control bg-surface-sunken px-3 py-2 text-subhead text-label-secondary"
          >
            Editing routines needs a connection. Logging works offline.
          </Text>
        ) : null}

        <View className="flex-row gap-2">
          <TrainButton
            testID="gym-routines-create-template"
            label="From a template"
            icon="routine"
            variant="tinted"
            className="flex-1"
            disabled={!isOnline}
            onPress={openTemplateSheet}
          />
          <TrainButton
            testID="gym-routines-create-blank"
            label="Blank routine"
            icon="add"
            variant="tinted"
            className="flex-1"
            disabled={!isOnline}
            onPress={() => setBlankSheetOpen(true)}
          />
        </View>

        {listState.state === 'error' ? (
          // UX-GYM-24: a failed load is an error with Retry, never "No routines yet".
          <ErrorState
            testID="gym-routines-error"
            title="Couldn’t load your routines"
            onRetry={listState.retry}
          />
        ) : listQuery.isPending && listQuery.fetchStatus !== 'paused' ? (
          <ActivityIndicator testID="gym-routines-loading" />
        ) : liveRoutines.length > 0 ? (
          <View testID="gym-routines-list" className="gap-2.5">
            {liveRoutines.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                disabled={!isOnline || busy}
                onSetActive={() => setActiveMutation.mutate({ id: routine.id })}
                onMore={() => setMenuTarget(routine)}
              />
            ))}
          </View>
        ) : (
          <TrainCard testID="gym-routines-empty">
            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              {isOnline ? 'No routines yet' : 'Needs a connection'}
            </Text>
            <Text className="text-subhead text-label-secondary">
              {isOnline
                ? 'Create one from a template or start from scratch.'
                : 'Your routines will load once you are back online.'}
            </Text>
          </TrainCard>
        )}
        {archivedRoutines.length > 0 ? (
          <ArchivedRoutines
            rows={archivedRoutines}
            restoringId={restoreMutation.isPending ? restoreMutation.variables.id : null}
            disabled={!isOnline || busy}
            onRestore={(routine) => restoreMutation.mutate({ id: routine.id })}
          />
        ) : null}
      </ScrollView>

      <Sheet
        visible={menuTarget !== null}
        onClose={() => setMenuTarget(null)}
        onExited={() => {
          const next = afterMenuExit.current;
          afterMenuExit.current = null;
          next?.();
        }}
        title={menuTarget?.name ?? 'Routine'}
        testID="gym-routines-menu-sheet"
      >
        <ListSection>
          <ListRow
            testID="gym-routines-menu-duplicate"
            title="Duplicate"
            accessory="none"
            onPress={() => {
              const target = menuTarget;
              setMenuTarget(null);
              if (target) duplicateMutation.mutate({ id: target.id });
            }}
          />
          {menuTarget && !menuTarget.archived ? (
            <ListRow
              testID="gym-routines-menu-archive"
              title="Archive"
              destructive
              onPress={() => {
                const target = menuTarget;
                // The confirm opens once this sheet has exited (iOS can't present
                // one sheet over a dismissing one).
                afterMenuExit.current = () => confirmArchive(target);
                setMenuTarget(null);
              }}
            />
          ) : null}
        </ListSection>
      </Sheet>

      <ConfirmSheet
        visible={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title={archiveTarget?.isActive ? 'Archive your active routine?' : 'Archive this routine?'}
        body={
          archiveTarget?.isActive
            ? `“${archiveTarget.name}” is your active routine. Today will have no workout to start until you set another routine active. Your history is kept.`
            : `"${archiveTarget?.name ?? 'This routine'}" will move out of your active list.`
        }
        confirmLabel="Archive"
        cancelLabel="Cancel"
        destructive
        busy={archiveMutation.isPending}
        error={archiveMutation.error ? userFacingErrorMessage(archiveMutation.error) : null}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate({ id: archiveTarget.id });
        }}
        testID="gym-routines-archive-confirm"
      />

      <Sheet
        visible={templateSheetOpen}
        onClose={() => {
          setTemplateSheetOpen(false);
          setPreviewKey(null);
        }}
        title={previewTemplate ? previewTemplate.name : 'Choose a template'}
        testID="gym-routines-template-sheet"
        footer={
          previewTemplate ? (
            <View className="gap-2">
              <TrainButton
                testID="gym-routines-template-create-switch"
                label={hasActive ? 'Create and switch' : 'Create'}
                size="lg"
                loading={
                  createFromTemplateMutation.isPending &&
                  createFromTemplateMutation.variables.setActive === true
                }
                disabled={createFromTemplateMutation.isPending}
                onPress={() =>
                  createFromTemplateMutation.mutate({
                    templateKey: previewTemplate.key,
                    setActive: true,
                  })
                }
              />
              {hasActive ? (
                <TrainButton
                  testID="gym-routines-template-create"
                  label="Create"
                  variant="outline"
                  loading={
                    createFromTemplateMutation.isPending &&
                    createFromTemplateMutation.variables.setActive === false
                  }
                  disabled={createFromTemplateMutation.isPending}
                  onPress={() =>
                    createFromTemplateMutation.mutate({
                      templateKey: previewTemplate.key,
                      setActive: false,
                    })
                  }
                />
              ) : null}
              <TrainButton
                testID="gym-routines-template-back"
                label="All templates"
                variant="ghost"
                onPress={() => setPreviewKey(null)}
              />
            </View>
          ) : undefined
        }
      >
        {previewTemplate ? (
          <TemplatePreviewBody
            template={previewTemplate}
            currentGoal={profile?.weeklyGoal ?? null}
            hasActive={hasActive}
            preview={preview}
          />
        ) : templatesQuery.isFetching ? (
          <ActivityIndicator testID="gym-routines-template-loading" />
        ) : (
          (templatesQuery.data ?? []).map((template) => (
            <TemplateRow
              key={template.key}
              template={template}
              disabled={createFromTemplateMutation.isPending}
              onPreview={() => setPreviewKey(template.key)}
            />
          ))
        )}
      </Sheet>

      <Sheet
        visible={blankSheetOpen}
        onClose={() => setBlankSheetOpen(false)}
        title="Blank routine"
        testID="gym-routines-blank-sheet"
        footer={
          <TrainButton
            testID="gym-routines-blank-create"
            label="Create"
            size="lg"
            loading={createBlankMutation.isPending}
            disabled={blankName.trim().length === 0}
            onPress={() => createBlankMutation.mutate({ name: blankName.trim(), days: blankDays })}
          />
        }
      >
        <Input
          testID="gym-routines-blank-name"
          value={blankName}
          onChangeText={setBlankName}
          placeholder="Routine name"
          maxLength={60}
          {...DONE_FIELD_PROPS}
        />
        <View className="min-h-11 flex-row items-center justify-between gap-3">
          <Text className="text-callout font-semibold text-label">Days</Text>
          <Stepper
            testID="gym-routines-blank-days"
            accessibilityLabel="Days"
            value={blankDays}
            min={1}
            max={7}
            onChange={setBlankDays}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
