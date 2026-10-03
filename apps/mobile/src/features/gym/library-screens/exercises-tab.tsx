import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { HIDDEN_EXERCISE_IMAGE_IDS, MUSCLE_LABELS } from '@chefer/types';
import {
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  Screen,
  SEARCH_LIST_PROPS,
  SearchField,
  Text,
} from '@chefer/ui-mobile';
import { useFlags } from '../../../hooks/use-flags';
import { ExerciseImage } from '../components/exercise-image';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { ModeSwitch } from '../components/mode-switch';
import { CollapsibleChipFilters } from '../library/collapsible-chip-filters';
import { createExerciseHref } from '../library/create-exercise-href';
import { exerciseImageUrl } from '../library/exercise-image';
import type { PickerFilter } from '../library/exercise-picker';
import { useKeyboardVisible } from '../library/use-keyboard-visible';
import { useGymBootstrap } from '../use-gym-bootstrap';
import {
  EQUIPMENT_FILTERS,
  filterExercisesForTab,
  MUSCLE_GROUP_FILTERS,
  MUSCLE_GROUP_FILTERS_WITH_CARDIO,
} from './exercise-filters';

// Exercises tab (gym_plan.md §1.3): search + muscle/equipment/mine filters
// over the offline-cached library, plus a low-priority background prefetch
// of the active routine's exercise photos so the workout screen opens warm.

const PREFETCH_DELAY_MS = 300;

export function ExercisesTab() {
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  // UX-GYM-24: a failed or offline first load must not read as "No exercises match".
  const { load, retry } = useGymBootstrapLoad(bootstrapQuery);
  const { cardioLogging } = useFlags();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<PickerFilter | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const groupFilterOptions = cardioLogging
    ? MUSCLE_GROUP_FILTERS_WITH_CARDIO
    : MUSCLE_GROUP_FILTERS;

  const library = useMemo(() => bootstrap?.library ?? [], [bootstrap]);

  const rows = useMemo(
    () => filterExercisesForTab(library, { query, group, equipment, mineOnly }),
    [library, query, group, equipment, mineOnly],
  );

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
    <Screen className="px-0" testID="gym-exercises-screen">
      <View className="gap-3 px-4 pb-2 pt-2">
        <ModeSwitch mode="gym" />
        <View className="flex-row items-center justify-between gap-3">
          <Text testID="gym-exercises-title" variant="title">
            Exercises
          </Text>
          <Button
            testID="exercises-create-custom"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/gym/exercise-form')}
          >
            + Custom
          </Button>
        </View>
        {/* UX-X-17: the shared 44 pt SearchField (testIDs unchanged). */}
        <SearchField
          testID="exercises-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          accessibilityLabel="Search exercises"
        />
        {/* T-05.A3.1 (AC19-22): two rows normally — 24 wrapping chips pushed
            the results below the keyboard (found by e2e/gym-library,
            2026-09-25) — collapsed to one strip while the keyboard is up, so
            >= 5 results stay visible. */}
        <CollapsibleChipFilters
          testID="exercises-filters"
          collapsed={keyboardVisible}
          rows={[
            <ChipGroup
              key="group"
              testID="exercises-group-filters"
              options={groupFilterOptions}
              value={group ? [group] : []}
              onChange={(v) => setGroup(v[0] ?? null)}
              allowEmpty
              className="flex-nowrap"
            />,
            <Chip
              key="mine"
              testID="exercises-mine-filter"
              label="Mine"
              selected={mineOnly}
              onPress={() => setMineOnly((v) => !v)}
            />,
            <ChipGroup
              key="equipment"
              testID="exercises-equipment-filters"
              options={EQUIPMENT_FILTERS}
              value={equipment ? [equipment] : []}
              onChange={(v) => setEquipment(v[0] ?? null)}
              allowEmpty
              className="flex-nowrap"
            />,
          ]}
        />
      </View>

      <FlatList
        testID="exercises-list"
        data={rows}
        keyExtractor={(e) => e.id}
        {...SEARCH_LIST_PROPS}
        initialNumToRender={14}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const uri = exerciseImageUrl(item);
          return (
            <Pressable
              testID={`exercises-item-${item.id}`}
              accessibilityRole="button"
              onPress={() => router.push(`/gym/exercise/${item.id}`)}
              className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-2 active:bg-muted"
            >
              <View className="w-16 shrink-0">
                <ExerciseImage
                  uri={uri}
                  equipment={item.equipment}
                  name={item.name}
                  size="thumb"
                  hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(item.id)}
                  analyticsExerciseId={item.ownerId ? 'custom' : item.id}
                  testID={`exercises-item-${item.id}-image`}
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-medium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="muted" numberOfLines={1}>
                  {item.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} ·{' '}
                  {item.equipment.toLowerCase().replace('_', ' ')}
                  {item.ownerId ? ' · custom' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
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
