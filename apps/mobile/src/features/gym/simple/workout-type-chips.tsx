import { useState } from 'react';
import { View } from 'react-native';
import { WORKOUT_TYPE_GROUPS, type WorkoutType } from '@chefer/types';
import { ChipGroup, haptics, Sheet, Text } from '@chefer/ui-mobile';
import { workoutTypeOptions } from '@chefer/utils';
import { TrainButton } from '../../shell/train/train-button';

// The workout-type chips (simple training mode §6.3), grouped under the
// shared WORKOUT_TYPE_GROUPS headers. One list for "Log a workout", the
// "What are you training?" picker and My week (which adds "Rest"). The
// strength focuses only show with the simple training flag on
// (`workoutTypeOptions`), so "Track my progress" keeps WP-20's list.

const REST = '__rest';

/** Picked type; `null` = Rest (My week only); `undefined` = nothing picked yet. */
export type WorkoutTypePick = WorkoutType | null | undefined;

export function WorkoutTypeChips({
  value,
  onChange,
  includeStrength,
  includeRest = false,
  testID,
}: {
  value: WorkoutTypePick;
  onChange: (next: WorkoutType | null) => void;
  includeStrength: boolean;
  includeRest?: boolean;
  testID: string;
}) {
  const options = workoutTypeOptions({ includeStrength });
  return (
    <View className="gap-3" testID={testID}>
      {includeRest ? (
        <ChipGroup
          testID={`${testID}-rest-group`}
          options={[{ value: REST, label: 'Rest', testID: `${testID}-REST` }]}
          value={value === null ? [REST] : []}
          onChange={(next) => {
            if (next[0] === REST) onChange(null);
          }}
        />
      ) : null}
      {WORKOUT_TYPE_GROUPS.map(({ group, label }) => {
        const inGroup = options.filter((o) => o.group === group);
        if (inGroup.length === 0) return null;
        return (
          <View key={group} className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="text-subhead font-semibold text-label-secondary"
            >
              {label}
            </Text>
            <ChipGroup<WorkoutType>
              testID={`${testID}-${group}`}
              options={inGroup.map((o) => ({
                value: o.type,
                label: o.label,
                testID: `${testID}-${o.type}`,
              }))}
              value={value && inGroup.some((o) => o.type === value) ? [value] : []}
              onChange={(next) => {
                const picked = next[0];
                if (picked) onChange(picked);
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * "What are you training?" — the type picker sheet. With `confirmLabel` the
 * pick waits for the footer button (Start a workout); without it a tap picks
 * and closes (My week's rows).
 */
export function WorkoutTypePickerSheet({
  visible,
  onClose,
  onExited,
  title = 'What are you training?',
  eyebrow,
  initial,
  includeStrength,
  includeRest = false,
  confirmLabel,
  onPick,
  testID = 'workout-type-picker',
}: {
  visible: boolean;
  onClose: () => void;
  onExited?: () => void;
  title?: string;
  eyebrow?: string;
  initial: WorkoutTypePick;
  includeStrength: boolean;
  includeRest?: boolean;
  confirmLabel?: string;
  onPick: (type: WorkoutType | null) => void;
  testID?: string;
}) {
  const [picked, setPicked] = useState<WorkoutTypePick>(initial);
  // A fresh preselection every time the sheet opens.
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setPicked(initial);
  }

  const footer = confirmLabel ? (
    <View className="px-4 pb-2 pt-3">
      <TrainButton
        testID={`${testID}-confirm`}
        label={confirmLabel}
        icon="play"
        size="lg"
        disabled={picked === undefined}
        onPress={() => {
          if (picked === undefined) return;
          onPick(picked);
        }}
      />
    </View>
  ) : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      {...(onExited && { onExited })}
      title={title}
      eyebrow={eyebrow}
      testID={testID}
      footer={footer}
    >
      <View className="pb-4">
        <WorkoutTypeChips
          testID={`${testID}-chips`}
          value={picked}
          includeStrength={includeStrength}
          includeRest={includeRest}
          onChange={(next) => {
            haptics.selection();
            setPicked(next);
            if (!confirmLabel) onPick(next);
          }}
        />
      </View>
    </Sheet>
  );
}
