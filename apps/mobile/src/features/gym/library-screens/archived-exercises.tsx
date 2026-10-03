import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseDto } from '@chefer/types';
import { Button, showSnackbar, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';

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
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  // A failed restore reaches the user through the default mutation snackbar.
  const restore = trpc.gym.library.restoreCustom.useMutation({
    onSuccess: () => void utils.gym.bootstrap.invalidate(),
  });

  if (rows.length === 0) return null;

  return (
    <View testID="exercises-archived" className="mt-4 border-t border-border">
      <Pressable
        testID="exercises-archived-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Archived exercises, ${rows.length}`}
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 flex-row items-center justify-between px-4 py-3"
      >
        <Text className="font-medium">{`Archived (${rows.length})`}</Text>
        <Text variant="muted">{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open
        ? rows.map((item) => (
            <View
              key={item.id}
              testID={`exercises-archived-item-${item.id}`}
              className="min-h-14 flex-row items-center gap-3 border-t border-border px-4 py-2"
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/gym/exercise/${item.id}`)}
                className="min-h-11 min-w-0 flex-1 justify-center"
              >
                <Text numberOfLines={1} className="font-medium">
                  {item.name}
                </Text>
                <Text variant="muted" numberOfLines={1}>
                  Past workouts keep their history
                </Text>
              </Pressable>
              <Button
                testID={`exercises-archived-restore-${item.id}`}
                size="sm"
                variant="secondary"
                accessibilityLabel={`Restore ${item.name}`}
                loading={restore.isPending && restore.variables.id === item.id}
                disabled={restore.isPending}
                onPress={() =>
                  restore.mutate(
                    { id: item.id },
                    { onSuccess: () => showSnackbar({ message: `Restored “${item.name}”.` }) },
                  )
                }
              >
                Restore
              </Button>
            </View>
          ))
        : null}
    </View>
  );
}
