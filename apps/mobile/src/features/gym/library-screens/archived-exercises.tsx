import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseDto } from '@chefer/types';
import { PressableScale, showSnackbar, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';

// UX-GYM-34: an archived custom exercise used to vanish with no way back. This
// collapsible "Archived" section sits under the Exercises list and offers
// Restore (past sessions keep their history either way, so there is no Delete).

/** The user's archived custom exercises, A–Z, optionally narrowed by the search text. */
export function archivedCustomExercises(
  library: readonly ExerciseDto[],
  query = '',
): ExerciseDto[] {
  const q = query.trim().toLowerCase();
  return library
    .filter((e) => e.archived && e.ownerId !== null)
    .filter((e) => q.length === 0 || e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ArchivedExercises({ rows }: { rows: ExerciseDto[] }) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  // A failed restore reaches the user through the default mutation snackbar.
  const restore = trpc.gym.library.restoreCustom.useMutation({
    onSuccess: () => void utils.gym.bootstrap.invalidate(),
  });

  if (rows.length === 0) return null;

  return (
    <View
      testID="exercises-archived"
      className="mt-2 overflow-hidden rounded-card border border-separator bg-surface"
    >
      {/* MO-01 press feedback on the disclosure row. */}
      <PressableScale
        testID="exercises-archived-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Archived exercises, ${rows.length}`}
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 flex-row items-center justify-between gap-3 px-4 py-3"
      >
        <Text className="text-headline font-semibold text-label">{`Archived (${rows.length})`}</Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-callout font-semibold text-brand">{open ? 'Hide' : 'Show'}</Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} color={colors.brand} size={18} />
        </View>
      </PressableScale>
      {open
        ? rows.map((item) => (
            <View
              key={item.id}
              testID={`exercises-archived-item-${item.id}`}
              className="min-h-14 flex-row items-center gap-3 border-t border-separator py-2 pl-4 pr-2"
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityHint="Opens the exercise"
                onPress={() => router.push(`/gym/exercise/${item.id}`)}
                className="min-h-11 min-w-0 flex-1 justify-center"
              >
                <Text numberOfLines={1} className="text-headline font-semibold text-label">
                  {item.name}
                </Text>
                <Text numberOfLines={1} className="text-caption text-label-secondary">
                  Past workouts keep their history
                </Text>
              </PressableScale>
              <TrainButton
                testID={`exercises-archived-restore-${item.id}`}
                label="Restore"
                variant="tinted"
                pill
                accessibilityLabel={`Restore ${item.name}`}
                loading={restore.isPending && restore.variables.id === item.id}
                disabled={restore.isPending}
                onPress={() =>
                  restore.mutate(
                    { id: item.id },
                    { onSuccess: () => showSnackbar({ message: `Restored “${item.name}”.` }) },
                  )
                }
              />
            </View>
          ))
        : null}
    </View>
  );
}
