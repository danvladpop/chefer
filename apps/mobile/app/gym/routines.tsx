import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { RoutineListItemDto, TemplateSummaryDto } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Screen,
  Sheet,
  Stepper,
  Text,
} from '@chefer/ui-mobile';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
import { trpc } from '../../src/lib/trpc';

// My routines (gym_plan.md §1.3 "Routine tab" routine switcher): create from
// a template or from scratch, set active, duplicate, archive. All online-only.

function RoutineRow({
  routine,
  onSetActive,
  onDuplicate,
  onArchive,
  disabled,
}: {
  routine: RoutineListItemDto;
  onSetActive: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  disabled: boolean;
}) {
  return (
    <Card testID={`routine-list-item-${routine.id}`}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-medium" numberOfLines={1}>
            {routine.name}
          </Text>
          <Text variant="muted" className="text-xs">
            {routine.dayCount} {routine.dayCount === 1 ? 'day' : 'days'}
          </Text>
        </View>
        <View className="flex-row gap-1">
          {routine.isActive ? (
            <Badge testID={`routine-list-item-${routine.id}-active`} variant="success">
              Active
            </Badge>
          ) : null}
          {routine.archived ? (
            <Badge testID={`routine-list-item-${routine.id}-archived`} variant="secondary">
              Archived
            </Badge>
          ) : null}
        </View>
      </View>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {!routine.isActive ? (
          <Button
            testID={`routine-list-item-${routine.id}-set-active`}
            size="sm"
            variant="outline"
            disabled={disabled}
            onPress={onSetActive}
          >
            Set active
          </Button>
        ) : null}
        <Button
          testID={`routine-list-item-${routine.id}-duplicate`}
          size="sm"
          variant="outline"
          disabled={disabled}
          onPress={onDuplicate}
        >
          Duplicate
        </Button>
        {!routine.archived ? (
          <Button
            testID={`routine-list-item-${routine.id}-archive`}
            size="sm"
            variant="destructive"
            disabled={disabled}
            onPress={onArchive}
          >
            Archive
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

function TemplateRow({
  template,
  onCreate,
  disabled,
}: {
  template: TemplateSummaryDto;
  onCreate: () => void;
  disabled: boolean;
}) {
  return (
    <View
      testID={`gym-routines-template-${template.key}`}
      className="gap-1 rounded-lg border border-border p-3"
    >
      <Text className="font-medium">{template.name}</Text>
      <Text variant="muted" className="text-xs">
        {template.daysPerWeek}×/week ·{' '}
        {template.experience === 'BEGINNER' ? 'Beginner' : 'Experienced'}
      </Text>
      <Text variant="muted" className="text-sm">
        {template.description}
      </Text>
      <Button
        testID={`gym-routines-template-${template.key}-create`}
        size="sm"
        className="mt-2 self-start"
        disabled={disabled}
        onPress={onCreate}
      >
        Create
      </Button>
    </View>
  );
}

export default function GymRoutinesScreen() {
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const listQuery = trpc.gym.routine.list.useQuery();
  const templatesQuery = trpc.gym.routine.templates.useQuery(undefined, { enabled: false });

  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [blankSheetOpen, setBlankSheetOpen] = useState(false);
  const [blankName, setBlankName] = useState('');
  const [blankDays, setBlankDays] = useState(3);

  const invalidateAll = () => {
    void utils.gym.routine.list.invalidate();
    void utils.gym.bootstrap.invalidate();
  };

  const setActiveMutation = trpc.gym.routine.setActive.useMutation({ onSuccess: invalidateAll });
  const duplicateMutation = trpc.gym.routine.duplicate.useMutation({ onSuccess: invalidateAll });
  const archiveMutation = trpc.gym.routine.archive.useMutation({ onSuccess: invalidateAll });
  const createFromTemplateMutation = trpc.gym.routine.createFromTemplate.useMutation({
    onSuccess: () => {
      invalidateAll();
      setTemplateSheetOpen(false);
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
    setActiveMutation.isPending || duplicateMutation.isPending || archiveMutation.isPending;

  const openTemplateSheet = () => {
    setTemplateSheetOpen(true);
    void templatesQuery.refetch();
  };

  const confirmArchive = (routine: RoutineListItemDto) => {
    Alert.alert('Archive this routine?', `"${routine.name}" will move out of your active list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => archiveMutation.mutate({ id: routine.id }),
      },
    ]);
  };

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <View className="flex-row items-center gap-3">
          <Pressable
            testID="gym-routines-title-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/routine'))}
            className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
          >
            <Ionicons name="chevron-back" size={22} color="#374151" />
          </Pressable>
          <Text testID="gym-routines-title" variant="title">
            My routines
          </Text>
        </View>

        {!isOnline ? (
          <View testID="gym-routines-offline-banner" className="rounded-lg bg-amber-50 px-3 py-2">
            <Text className="text-sm text-amber-900">
              Editing routines needs a connection. Logging works offline.
            </Text>
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <Button
            testID="gym-routines-create-template"
            variant="outline"
            className="flex-1"
            disabled={!isOnline}
            onPress={openTemplateSheet}
          >
            From a template
          </Button>
          <Button
            testID="gym-routines-create-blank"
            variant="outline"
            className="flex-1"
            disabled={!isOnline}
            onPress={() => setBlankSheetOpen(true)}
          >
            Blank routine
          </Button>
        </View>

        {listQuery.isPending ? (
          <ActivityIndicator testID="gym-routines-loading" />
        ) : listQuery.data && listQuery.data.length > 0 ? (
          <View className="gap-3">
            {listQuery.data.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                disabled={!isOnline || busy}
                onSetActive={() => setActiveMutation.mutate({ id: routine.id })}
                onDuplicate={() => duplicateMutation.mutate({ id: routine.id })}
                onArchive={() => confirmArchive(routine)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            testID="gym-routines-empty"
            title={isOnline ? 'No routines yet' : 'Needs a connection'}
            description={
              isOnline
                ? 'Create one from a template or start from scratch.'
                : 'Your routines will load once you are back online.'
            }
          />
        )}
      </ScrollView>

      <Sheet
        visible={templateSheetOpen}
        onClose={() => setTemplateSheetOpen(false)}
        title="Choose a template"
        testID="gym-routines-template-sheet"
      >
        {templatesQuery.isFetching ? (
          <ActivityIndicator testID="gym-routines-template-loading" />
        ) : (
          (templatesQuery.data ?? []).map((template) => (
            <TemplateRow
              key={template.key}
              template={template}
              disabled={createFromTemplateMutation.isPending}
              onCreate={() =>
                createFromTemplateMutation.mutate({ templateKey: template.key, setActive: true })
              }
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
          <Button
            testID="gym-routines-blank-create"
            loading={createBlankMutation.isPending}
            disabled={blankName.trim().length === 0}
            onPress={() => createBlankMutation.mutate({ name: blankName.trim(), days: blankDays })}
          >
            Create
          </Button>
        }
      >
        <Input
          testID="gym-routines-blank-name"
          value={blankName}
          onChangeText={setBlankName}
          placeholder="Routine name"
          maxLength={60}
        />
        <View className="flex-row items-center justify-between">
          <Text variant="label">Days</Text>
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
