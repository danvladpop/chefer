import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { MUSCLE_LABELS, type VolumeGroup } from '@chefer/types';
import { Button, Chip, ChipGroup, EmptyState, Input, Screen, Text } from '@chefer/ui-mobile';
import { ModeSwitch } from '../components/mode-switch';
import { exerciseImageUrl } from '../library/exercise-image';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EQUIPMENT_FILTERS, filterExercisesForTab, MUSCLE_GROUP_FILTERS } from './exercise-filters';

// Exercises tab (gym_plan.md §1.3): search + muscle/equipment/mine filters
// over the offline-cached library, plus a low-priority background prefetch
// of the active routine's exercise photos so the workout screen opens warm.

const PREFETCH_DELAY_MS = 300;

export function ExercisesTab() {
  const { data: bootstrap, isLoading } = useGymBootstrap();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<VolumeGroup | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

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
        <ModeSwitch />
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
        <Input
          testID="exercises-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          autoCorrect={false}
          accessibilityLabel="Search exercises"
        />
        {/* One swipeable row each — 24 wrapping chips pushed the results
            below the keyboard (found by e2e/gym-library, 2026-09-25). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4"
          contentContainerClassName="px-4"
        >
          <ChipGroup
            testID="exercises-group-filters"
            options={MUSCLE_GROUP_FILTERS}
            value={group ? [group] : []}
            onChange={(v) => setGroup(v[0] ?? null)}
            allowEmpty
            className="flex-nowrap"
          />
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4"
          contentContainerClassName="gap-2 px-4"
        >
          <Chip
            testID="exercises-mine-filter"
            label="Mine"
            selected={mineOnly}
            onPress={() => setMineOnly((v) => !v)}
          />
          <ChipGroup
            testID="exercises-equipment-filters"
            options={EQUIPMENT_FILTERS}
            value={equipment ? [equipment] : []}
            onChange={(v) => setEquipment(v[0] ?? null)}
            allowEmpty
            className="flex-nowrap"
          />
        </ScrollView>
      </View>

      <FlatList
        testID="exercises-list"
        data={rows}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
              {uri ? (
                <Image
                  source={{ uri }}
                  style={{ width: 48, height: 48, borderRadius: 8 }}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                // No public-domain photo (some home moves, custom exercises).
                <View
                  testID={`exercises-item-${item.id}-placeholder`}
                  className="h-12 w-12 items-center justify-center rounded-lg bg-muted"
                >
                  <Ionicons name="barbell-outline" size={22} color="#9ca3af" />
                </View>
              )}
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
          isLoading ? (
            <Text variant="muted" className="px-4 py-6 text-center">
              Loading exercises…
            </Text>
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
                mineOnly
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
