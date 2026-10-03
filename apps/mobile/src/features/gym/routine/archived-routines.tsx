import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RoutineListItemDto } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';

// UX-GYM-34: an archived routine used to sit in the main list with a badge and
// no way back except "Set active". This collapsible "Archived" section lists
// them with Restore (comes back inactive; history is kept either way). The twin
// of the Exercises tab's `archived-exercises.tsx`.

export function ArchivedRoutines({
  rows,
  restoringId,
  disabled,
  onRestore,
}: {
  rows: RoutineListItemDto[];
  /** The routine whose restore is in flight (spinner on its button). */
  restoringId: string | null;
  disabled: boolean;
  onRestore: (routine: RoutineListItemDto) => void;
}) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  return (
    <View testID="routines-archived" className="border-t border-border">
      <Pressable
        testID="routines-archived-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Archived routines, ${rows.length}`}
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 flex-row items-center justify-between py-3"
      >
        <Text className="font-medium">{`Archived (${rows.length})`}</Text>
        <Text variant="muted">{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open
        ? rows.map((routine) => (
            <View
              key={routine.id}
              testID={`routines-archived-item-${routine.id}`}
              className="min-h-14 flex-row items-center gap-3 border-t border-border py-2"
            >
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-medium">
                  {routine.name}
                </Text>
                <Text variant="muted" numberOfLines={1}>
                  {`${routine.dayCount} ${routine.dayCount === 1 ? 'day' : 'days'} · past workouts keep their history`}
                </Text>
              </View>
              <Button
                testID={`routines-archived-restore-${routine.id}`}
                size="sm"
                variant="secondary"
                accessibilityLabel={`Restore ${routine.name}`}
                loading={restoringId === routine.id}
                disabled={disabled}
                onPress={() => onRestore(routine)}
              >
                Restore
              </Button>
            </View>
          ))
        : null}
    </View>
  );
}
