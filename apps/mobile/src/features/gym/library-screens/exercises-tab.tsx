import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { HIDDEN_EXERCISE_IMAGE_IDS, MUSCLE_LABELS, type ExerciseDto } from '@chefer/types';
import {
  EmptyState,
  PressableScale,
  Screen,
  SEARCH_LIST_PROPS,
  SearchField,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { ShellTopBar, useShellChrome } from '../../shell/shell-chrome';
import { TrainButton } from '../../shell/train/train-button';
import { ExerciseImage } from '../components/exercise-image';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { ModeSwitch } from '../components/mode-switch';
import { CollapsibleChipFilters, FilterPill } from '../library/collapsible-chip-filters';
import { createExerciseHref } from '../library/create-exercise-href';
import { EquipmentFilterChip } from '../library/equipment-filter-chip';
import { exerciseImageUrl } from '../library/exercise-image';
import type { PickerFilter } from '../library/exercise-picker';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { archivedCustomExercises, ArchivedExercises } from './archived-exercises';
import {
  EQUIPMENT_FILTERS,
  filterExercisesForTab,
  MUSCLE_GROUP_FILTERS,
  MUSCLE_GROUP_FILTERS_WITH_CARDIO,
} from './exercise-filters';

// Exercises tab (gym_plan.md §1.3): search + muscle/equipment/mine filters
// over the offline-cached library, plus a low-priority background prefetch
// of the active routine's exercise photos so the workout screen opens warm.

// 10 Oct redesign: on the canvas, under the shell top bar ("Exercises" +
// Back, pushed from Train) or — in the old shell — the Food|Gym switch and a
// title1 heading; brand-tint filter pills; one surface card per exercise
// (the past-workouts `MediaRow` look, keeping the 3:2 exercise photo).

const PREFETCH_DELAY_MS = 300;

/** "+ Custom": opens the custom-exercise form (also the pushed route's top-bar action). */
export function CreateExerciseButton() {
  return (
    <TrainButton
      testID="exercises-create-custom"
      label="Custom"
      icon="add"
      variant="tinted"
      pill
      accessibilityLabel="Create custom exercise"
      onPress={() => router.push('/gym/exercise-form')}
    />
  );
}

/** "Chest, Triceps · barbell" — the row's meta line. */
export function exerciseRowMeta(item: ExerciseDto): string {
  return `${item.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · ${item.equipment
    .toLowerCase()
    .replace('_', ' ')}`;
}

function ExerciseRow({ item }: { item: ExerciseDto }) {
  const colors = useThemeColors();
  const custom = item.ownerId !== null;
  const meta = exerciseRowMeta(item);
  return (
    // MO-01: card-scale press feedback, like MediaRow.
    <PressableScale
      testID={`exercises-item-${item.id}`}
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={[item.name, custom ? 'custom' : null, meta].filter(Boolean).join(', ')}
      accessibilityHint="Opens the exercise"
      onPress={() => router.push(`/gym/exercise/${item.id}`)}
      className="min-h-14 flex-row items-center gap-3 rounded-card border border-separator bg-surface py-2 pl-2 pr-3"
    >
      <View className="w-16 shrink-0">
        <ExerciseImage
          uri={exerciseImageUrl(item)}
          equipment={item.equipment}
          name={item.name}
          size="thumb"
          hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(item.id)}
          analyticsExerciseId={custom ? 'custom' : item.id}
          testID={`exercises-item-${item.id}-image`}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-headline font-semibold text-label">
            {item.name}
          </Text>
          {custom ? (
            <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
              Custom
            </Text>
          ) : null}
        </View>
        <Text numberOfLines={1} className="text-caption text-label-secondary">
          {meta}
        </Text>
      </View>
      <Icon name="chevronRight" color={colors.labelTertiary} size={18} />
    </PressableScale>
  );
}

export function ExercisesTab() {
  // The pushed new-shell route names the page itself (ShellTopBar title).
  const pushed = useShellChrome()?.title !== undefined;
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  // UX-GYM-24: a failed or offline first load must not read as "No exercises match".
  const { load, retry } = useGymBootstrapLoad(bootstrapQuery);
  const { cardioLogging } = useFlags();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<PickerFilter | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const filtersActive = group !== null || equipment !== null || mineOnly;
  const groupFilterOptions = cardioLogging
    ? MUSCLE_GROUP_FILTERS_WITH_CARDIO
    : MUSCLE_GROUP_FILTERS;

  const library = useMemo(() => bootstrap?.library ?? [], [bootstrap]);

  const rows = useMemo(
    () => filterExercisesForTab(library, { query, group, equipment, mineOnly }),
    [library, query, group, equipment, mineOnly],
  );

  const archived = useMemo(() => archivedCustomExercises(library, query), [library, query]);

  const prefetched = useRef(false);
  useEffect(() => {
    if (prefetched.current || !bootstrap?.activeRoutine) return;
    prefetched.current = true;
    const timer = setTimeout(() => {
      const byId = new Map(bootstrap.library.map((e) => [e.id, e]));
      const ids = new Set(
        bootstrap.activeRoutine?.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)) ?? [],
      );
      for (const id of ids) {
        const exercise = byId.get(id);
        if (!exercise) continue;
        for (let i = 0; i < exercise.images.length; i++) {
          const uri = exerciseImageUrl(exercise, i);
          if (uri) void Image.prefetch(uri);
        }
      }
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [bootstrap]);

  return (
    <Screen className="bg-canvas px-0" testID="gym-exercises-screen">
      <View className="gap-3 px-4 pb-2 pt-3">
        {pushed ? (
          // New shell: Back + "Exercises" + the Custom action, from the route.
          <ShellTopBar />
        ) : (
          <>
            <ModeSwitch mode="gym" />
            <View className="min-h-11 flex-row items-center justify-between gap-3">
              <Text
                testID="gym-exercises-title"
                accessibilityRole="header"
                className="min-w-0 flex-1 text-title1 font-bold text-label"
                numberOfLines={1}
              >
                Exercises
              </Text>
              <CreateExerciseButton />
            </View>
          </>
        )}
        {/* UX-X-17: the shared 44 pt SearchField (testIDs unchanged). */}
        <SearchField
          testID="exercises-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          accessibilityLabel="Search exercises"
        />
        {/* FB7-07: ONE scrolling row — Equipment ▾ (opens a sheet), Mine,
            Clear (only while a filter is set), then the muscle chips. */}
        <CollapsibleChipFilters testID="exercises-filters">
          <EquipmentFilterChip
            testID="exercises-equipment-filter"
            options={EQUIPMENT_FILTERS}
            value={equipment}
            onChange={setEquipment}
            tone="brand"
          />
          <FilterPill
            testID="exercises-mine-filter"
            label="Mine"
            selected={mineOnly}
            onPress={() => setMineOnly((v) => !v)}
          />
          {filtersActive ? (
            <FilterPill
              testID="exercises-clear-filters"
              label="Clear"
              accessibilityHint="Removes the muscle, equipment and Mine filters"
              onPress={() => {
                setGroup(null);
                setEquipment(null);
                setMineOnly(false);
              }}
            />
          ) : null}
          <View testID="exercises-group-filters" className="flex-row gap-2">
            {groupFilterOptions.map((option) => (
              <FilterPill
                key={option.value}
                testID={`exercises-group-${option.value}`}
                label={option.label}
                selected={group === option.value}
                // Single choice; tapping the selected muscle clears it.
                onPress={() => setGroup((g) => (g === option.value ? null : option.value))}
              />
            ))}
          </View>
        </CollapsibleChipFilters>
      </View>

      <FlatList
        testID="exercises-list"
        data={rows}
        keyExtractor={(e) => e.id}
        {...SEARCH_LIST_PROPS}
        initialNumToRender={14}
        contentContainerClassName="gap-2.5 px-4 pb-8 pt-1"
        renderItem={({ item }) => <ExerciseRow item={item} />}
        ListFooterComponent={<ArchivedExercises rows={archived} />}
        ListEmptyComponent={
          load !== 'data' ? (
            <GymBootstrapUnavailable
              load={load}
              onRetry={retry}
              testID="exercises"
              what="the exercises"
            />
          ) : (
            <EmptyState
              testID="exercises-empty"
              title="No exercises match"
              description={
                mineOnly
                  ? 'You haven’t created a custom exercise yet.'
                  : 'Try another search or clear a filter.'
              }
              action={
                query.trim().length >= 2 && !mineOnly
                  ? {
                      // UX-GYM-21: nothing matched — offer to create it.
                      label: `Create “${query.trim()}”`,
                      testID: 'exercises-empty-create-from-search',
                      onPress: () => router.push(createExerciseHref(query)),
                    }
                  : mineOnly
                    ? {
                        label: 'Create custom exercise',
                        testID: 'exercises-empty-create',
                        onPress: () => router.push('/gym/exercise-form'),
                      }
                    : undefined
              }
            />
          )
        }
      />
    </Screen>
  );
}
