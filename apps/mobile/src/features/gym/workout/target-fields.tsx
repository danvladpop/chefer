import { useCallback } from 'react';
import { View } from 'react-native';
import type { EquipmentProfile, ExerciseMeta, WeightUnit } from '@chefer/types';
import { Text, ValueStepper } from '@chefer/ui-mobile';
import { formatLoad } from '@chefer/utils';
import { NumberSheet } from './number-sheet';
import { loggingProfile, nextLoad, weightModeOf } from './workout-model';

// UX-GYM-28: the weight/reps fields of the "Next time" target editor, shared by
// the summary's Adjust sheet and the Routine tab's target sheet. Weight steps
// through the exercise's real loads (bar + plates, dumbbell rack, machine
// step — rounded, never "132.3 → 137.3 lb"), and tapping a value opens the
// same keypad the live logger uses, so 40 → 150 kg is a typed number rather
// than ~44 taps. Weight is held in kg, the unit the API stores. The keypad is a
// separate component so a parent can render it OUTSIDE its own Sheet (iOS does
// not like a Modal opened from inside another Modal's body).

export type TargetEditing = 'weight' | 'reps' | null;

export function nextReps(meta: ExerciseMeta, reps: number, direction: 1 | -1): number {
  return Math.min(meta.isTimed ? 3600 : 100, Math.max(1, reps + direction));
}

export function TargetFields({
  testID,
  meta,
  unit,
  profile,
  weightKg,
  onWeightKg,
  repsFirst,
  onRepsFirst,
  allReps,
  onEdit,
}: {
  /** Prefix: `${testID}-weight`, `-reps`, `-reps-all`. */
  testID: string;
  meta: ExerciseMeta;
  unit: WeightUnit;
  profile: EquipmentProfile;
  weightKg: number;
  onWeightKg: (kg: number) => void;
  repsFirst: number;
  onRepsFirst: (reps: number) => void;
  /** The rep target of every set, shown under the stepper. */
  allReps: number[];
  /** Tapping a value asks the parent to open the keypad. */
  onEdit: (field: 'weight' | 'reps') => void;
}) {
  const stepWeight = useCallback(
    (kg: number, direction: 1 | -1) => nextLoad(kg, direction, meta, profile),
    [meta, profile],
  );
  const stepReps = useCallback(
    (r: number, direction: 1 | -1) => nextReps(meta, r, direction),
    [meta],
  );
  const formatWeight = useCallback(
    (kg: number) => formatLoad(kg, unit, meta.loadType, { each: meta.perHand }),
    [unit, meta.loadType, meta.perHand],
  );
  const formatReps = useCallback((r: number) => String(r), []);
  const repsLabel = meta.isTimed ? 'Seconds' : 'Reps';

  return (
    <>
      <View className="gap-1">
        <Text variant="label">Weight</Text>
        <ValueStepper
          testID={`${testID}-weight`}
          name="Weight"
          value={weightKg}
          next={stepWeight}
          onChange={onWeightKg}
          format={formatWeight}
          caption=""
          onPressValue={() => onEdit('weight')}
        />
      </View>
      <View className="gap-1">
        <Text variant="label">{repsLabel} on the first set</Text>
        <ValueStepper
          testID={`${testID}-reps`}
          name={repsLabel}
          value={repsFirst}
          next={stepReps}
          onChange={onRepsFirst}
          format={formatReps}
          caption=""
          onPressValue={() => onEdit('reps')}
        />
        <Text testID={`${testID}-reps-all`} variant="muted">
          All sets: {allReps.join(' / ')}
        </Text>
      </View>
    </>
  );
}

/** The typed-entry keypad for {@link TargetFields} — render it beside (not inside) the Sheet. */
export function TargetKeypad({
  editing,
  onClose,
  meta,
  unit,
  profile,
  weightKg,
  onWeightKg,
  repsFirst,
  onRepsFirst,
}: {
  editing: TargetEditing;
  onClose: () => void;
  meta: ExerciseMeta;
  unit: WeightUnit;
  profile: EquipmentProfile;
  weightKg: number;
  onWeightKg: (kg: number) => void;
  repsFirst: number;
  onRepsFirst: (reps: number) => void;
}) {
  const repsLabel = meta.isTimed ? 'Seconds' : 'Reps';
  return (
    <NumberSheet
      key={editing ?? 'closed'}
      visible={editing !== null}
      onClose={onClose}
      kind={editing === 'reps' ? 'reps' : 'weight'}
      value={editing === 'reps' ? repsFirst : weightKg}
      title={`${meta.name} · ${editing === 'reps' ? repsLabel : 'Weight'}`}
      unit={unit}
      meta={meta}
      profile={loggingProfile(meta, profile)}
      showPlates={editing === 'weight' && weightModeOf(meta, profile) === 'plates'}
      timed={meta.isTimed}
      onSubmit={(value) => {
        if (editing === 'reps') onRepsFirst(value);
        else onWeightKg(value);
        onClose();
      }}
    />
  );
}
