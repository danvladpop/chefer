import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, TextInput, View } from 'react-native';
import {
  HIDDEN_EXERCISE_IMAGE_IDS,
  LIBRARY_FILTER_GROUPS,
  MUSCLE_LABELS,
  type ExerciseDto,
  type LibraryFilterGroup,
} from '@chefer/types';
import { Button, ChipGroup, keyboardDismissMode, Sheet, Text } from '@chefer/ui-mobile';
import {
  cn,
  exerciseMatchesFilterGroup,
  isStrengthTrackingType,
  LIBRARY_FILTER_GROUP_LABELS,
  trackingTypeOf,
} from '@chefer/utils';
import { ExerciseImage } from '../components/exercise-image';
import { useIsOnline } from '../library-screens/online-status';
import { CollapsibleChipFilters } from './collapsible-chip-filters';
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
  /** T-42.3: show a "Cardio" filter chip first (behind cardioLogging — the caller decides). */
  showCardioFilter?: boolean;
  /**
   * UX-GYM-21: when nothing matches the search, offer `Create "<query>"` (online
   * only — custom exercises are created on the server). The picker closes
   * itself first, then calls this with the searched name; the caller opens the
   * form (`openCreateExercise`). Omit for pickers that only choose existing lifts.
   */
  onCreateFromSearch?: (name: string) => void;
  testID?: string;
}

/** T-42.3: the picker's group filter is a library muscle group (L2), or the special "Cardio" bucket. */
export type PickerFilter = LibraryFilterGroup | 'CARDIO';

const GROUP_FILTERS: { value: LibraryFilterGroup; label: string }[] = (
  Object.keys(LIBRARY_FILTER_GROUPS) as LibraryFilterGroup[]
).map((group) => ({
  value: group,
  label: LIBRARY_FILTER_GROUP_LABELS[group],
}));

const CARDIO_FILTER: { value: PickerFilter; label: string } = { value: 'CARDIO', label: 'Cardio' };

export function filterExercises(
  library: ExerciseDto[],
  opts: { query: string; group: PickerFilter | null; excludeIds?: readonly string[] },
): ExerciseDto[] {
  const q = opts.query.trim().toLowerCase();
  return library
    .filter((e) => !e.archived && !(opts.excludeIds ?? []).includes(e.id))
    .filter((e) => {
      if (opts.group === 'CARDIO') return !isStrengthTrackingType(trackingTypeOf(e));
      return opts.group ? exerciseMatchesFilterGroup(e, opts.group) : true;
    })
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
  showCardioFilter = false,
  onCreateFromSearch,
  testID = 'exercise-picker',
}: ExercisePickerProps) {
  const online = useIsOnline();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<PickerFilter | null>(null);
  const filterOptions = showCardioFilter ? [CARDIO_FILTER, ...GROUP_FILTERS] : GROUP_FILTERS;

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
        <View className="relative justify-center">
          <TextInput
            testID={`${testID}-search`}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor="#4b5563"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel="Search exercises"
            className={cn(
              'min-h-11 rounded-xl border border-border bg-background px-3 text-base',
              query && 'pr-11',
            )}
          />
          {query ? (
            <Pressable
              testID={`${testID}-search-clear`}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              className="absolute right-1 h-11 w-11 items-center justify-center"
            >
              <Text className="text-lg text-muted-foreground">✕</Text>
            </Pressable>
          ) : null}
        </View>
        {/* FB7-07: one horizontally scrolling row of muscle chips. */}
        <CollapsibleChipFilters testID={`${testID}-filters`}>
          <ChipGroup
            testID={`${testID}-groups`}
            options={filterOptions}
            value={group ? [group] : []}
            onChange={(v) => setGroup(v[0] ?? null)}
            allowEmpty
            className="flex-nowrap"
          />
        </CollapsibleChipFilters>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode()}
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
              <ExerciseImage
                uri={uri}
                equipment={item.equipment}
                name={item.name}
                size="thumb"
                hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(item.id)}
                analyticsExerciseId={item.ownerId ? 'custom' : item.id}
                testID={`${testID}-item-${item.id}-image`}
              />
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
          <View className="items-center gap-3 px-4 py-6">
            <Text variant="muted" className="text-center">
              No exercises match. Try another search.
            </Text>
            {onCreateFromSearch && online && query.trim().length >= 2 ? (
              <Button
                testID={`${testID}-create-from-search`}
                variant="outline"
                onPress={() => {
                  onClose();
                  onCreateFromSearch(query.trim());
                }}
              >
                {`Create “${query.trim()}”`}
              </Button>
            ) : null}
          </View>
        }
      />
    </Sheet>
  );
}
