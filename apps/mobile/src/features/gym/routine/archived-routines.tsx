import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RoutineListItemDto } from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { TrainButton } from '../../shell/train/train-button';

// UX-GYM-34: an archived routine used to sit in the main list with a badge and
// no way back except "Set active". This collapsible "Archived" section lists
// them with Restore (comes back inactive; history is kept either way). The twin
// of the Exercises tab's `archived-exercises.tsx`.
// 10 Oct redesign: one surface card with hairline rows (ListSection's shape);
// the header row toggles it open.

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
  const colors = useThemeColors();

  if (rows.length === 0) return null;

  return (
    <View
      testID="routines-archived"
      className="overflow-hidden rounded-card border border-separator bg-surface"
    >
      <Pressable
        testID="routines-archived-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Archived routines, ${rows.length}`}
        onPress={() => setOpen((v) => !v)}
        className="min-h-12 flex-row items-center justify-between gap-2 px-4 py-3 active:bg-surface-sunken"
      >
        <Text className="text-headline font-semibold text-label">{`Archived (${rows.length})`}</Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-callout font-semibold text-brand">{open ? 'Hide' : 'Show'}</Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} color={colors.brand} size={16} />
        </View>
      </Pressable>
      {open
        ? rows.map((routine) => (
            <View
              key={routine.id}
              testID={`routines-archived-item-${routine.id}`}
              className="min-h-14 flex-row items-center gap-3 border-t border-separator px-4 py-2"
            >
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-body text-label">
                  {routine.name}
                </Text>
                <Text numberOfLines={1} className="text-caption text-label-secondary">
                  {`${routine.dayCount} ${routine.dayCount === 1 ? 'day' : 'days'} · past workouts keep their history`}
                </Text>
              </View>
              <TrainButton
                testID={`routines-archived-restore-${routine.id}`}
                label="Restore"
                variant="tinted"
                accessibilityLabel={`Restore ${routine.name}`}
                loading={restoringId === routine.id}
                disabled={disabled}
                onPress={() => onRestore(routine)}
              />
            </View>
          ))
        : null}
    </View>
  );
}
