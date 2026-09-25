import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { MUSCLE_LABELS, VOLUME_GROUPS, type ExerciseDto, type VolumeGroup } from '@chefer/types';
import { ChipGroup, Sheet, Text } from '@chefer/ui-mobile';
import { exerciseImageUrl } from './exercise-image';

// Shared exercise picker (swap in the workout, add to a routine/session).
// Reads the offline-cached library, so it works in a basement gym.

export interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseDto) => void;
  library: ExerciseDto[];
  title?: string;
  /** Exercises sharing this swap group are listed first under "Similar". */
  preferSwapGroup?: string | null;
  /** Hidden from the list (e.g. the exercise being swapped out). */
  excludeIds?: readonly string[];
  testID?: string;
}

const GROUP_FILTERS: { value: VolumeGroup; label: string }[] = (
  Object.keys(VOLUME_GROUPS) as VolumeGroup[]
).map((group) => ({
  value: group,
  label: (MUSCLE_LABELS as Record<string, string | undefined>)[group] ?? 'Back',
}));

function matchesGroup(exercise: ExerciseDto, group: VolumeGroup): boolean {
  const muscles = VOLUME_GROUPS[group] as readonly string[];
  return exercise.primaryMuscles.some((m) => muscles.includes(m));
}

export function filterExercises(
  library: ExerciseDto[],
  opts: { query: string; group: VolumeGroup | null; excludeIds?: readonly string[] },
): ExerciseDto[] {
  const q = opts.query.trim().toLowerCase();
  return library
    .filter((e) => !e.archived && !(opts.excludeIds ?? []).includes(e.id))
    .filter((e) => (opts.group ? matchesGroup(e, opts.group) : true))
    .filter((e) =>
      q.length === 0
        ? true
        : e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ExercisePicker({
  visible,
  onClose,
  onPick,
  library,
  title = 'Choose an exercise',
  preferSwapGroup,
  excludeIds,
  testID = 'exercise-picker',
}: ExercisePickerProps) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<VolumeGroup | null>(null);

  const rows = useMemo(() => {
    const all = filterExercises(library, { query, group, excludeIds });
    if (!preferSwapGroup || query || group) return all;
    const similar = all.filter((e) => e.swapGroup === preferSwapGroup);
    const rest = all.filter((e) => e.swapGroup !== preferSwapGroup);
    return [...similar, ...rest];
  }, [library, query, group, excludeIds, preferSwapGroup]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} scrollable={false} testID={testID}>
      <View className="gap-3 px-4 pb-2">
        <TextInput
          testID={`${testID}-search`}
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          autoCorrect={false}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-base"
        />
        <ChipGroup
          testID={`${testID}-groups`}
          options={GROUP_FILTERS}
          value={group ? [group] : []}
          onChange={(v) => setGroup(v[0] ?? null)}
          allowEmpty
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        renderItem={({ item }) => {
          const uri = exerciseImageUrl(item);
          const similar = preferSwapGroup && item.swapGroup === preferSwapGroup;
          return (
            <Pressable
              testID={`${testID}-item-${item.id}`}
              accessibilityRole="button"
              onPress={() => onPick(item)}
              className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-2 active:bg-muted"
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View className="h-11 w-11 rounded-lg bg-muted" />
              )}
              <View className="min-w-0 flex-1">
                <Text className="font-medium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="muted" numberOfLines={1}>
                  {item.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} ·{' '}
                  {item.equipment.toLowerCase().replace('_', ' ')}
                  {similar ? ' · similar' : ''}
                  {item.ownerId ? ' · custom' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text variant="muted" className="px-4 py-6 text-center">
            No exercises match. Try another search.
          </Text>
        }
      />
    </Sheet>
  );
}
