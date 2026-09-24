import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ExerciseMeta, ProgressionDto, WeightUnit } from '@chefer/types';
import { Button, Sheet, Stepper, Text } from '@chefer/ui-mobile';
import { formatLoad, kgToUnit } from '@chefer/utils';
import { buildOverridePayload, type SetOverrideInput } from './override-payload';

// Next-session target override (D5c, gym_plan.md §1.3 "Routine tab"): weight
// and reps steppers in the user's unit, "Save target" / "Reset to
// suggestion". One rep target applies to every working set — the same
// simplification the setOverride API makes (an array, all equal here).

export interface OverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  exercise: ExerciseMeta;
  unit: WeightUnit;
  repBucket: string;
  progression: ProgressionDto;
  onSave: (payload: SetOverrideInput) => void;
  onReset: () => void;
  saving?: boolean;
  testID?: string;
}

function weightStep(unit: WeightUnit): number {
  return unit === 'LB' ? 5 : 2.5;
}

export function OverrideSheet({
  visible,
  onClose,
  exercise,
  unit,
  repBucket,
  progression,
  onSave,
  onReset,
  saving = false,
  testID = 'routine-override-sheet',
}: OverrideSheetProps) {
  const { suggestion, override } = progression;
  const baseWeightKg = override?.weightKg ?? suggestion.weightKg;
  const baseReps = override?.reps[0] ?? suggestion.reps[0] ?? exercise.repMin;

  const [weight, setWeight] = useState(() => kgToUnit(baseWeightKg, unit));
  const [reps, setReps] = useState(baseReps);

  useEffect(() => {
    if (!visible) return;
    setWeight(kgToUnit(baseWeightKg, unit));
    setReps(baseReps);
  }, [visible, baseWeightKg, baseReps, unit]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Next target: ${exercise.name}`}
      testID={testID}
      footer={
        <View className="flex-row gap-2">
          <Button
            testID={`${testID}-reset`}
            variant="outline"
            className="flex-1"
            disabled={!override || saving}
            onPress={onReset}
          >
            Reset to suggestion
          </Button>
          <Button
            testID={`${testID}-save`}
            className="flex-1"
            loading={saving}
            onPress={() =>
              onSave(
                buildOverridePayload({
                  exerciseId: exercise.id,
                  repBucket,
                  unit,
                  weightDisplay: weight,
                  repsDisplay: reps,
                  sets: suggestion.sets,
                }),
              )
            }
          >
            Save target
          </Button>
        </View>
      }
    >
      {override ? (
        <Text testID={`${testID}-edited`} variant="muted">
          Currently edited. Engine suggestion:{' '}
          {formatLoad(suggestion.weightKg, unit, exercise.loadType)}.
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between py-2">
        <Text variant="label">Weight</Text>
        <Stepper
          testID={`${testID}-weight`}
          accessibilityLabel="Weight"
          value={weight}
          onChange={setWeight}
          step={weightStep(unit)}
          min={0}
          format={(v) => `${v} ${unit === 'LB' ? 'lb' : 'kg'}`}
        />
      </View>
      <View className="flex-row items-center justify-between py-2">
        <Text variant="label">{exercise.isTimed ? 'Seconds' : 'Reps'}</Text>
        <Stepper
          testID={`${testID}-reps`}
          accessibilityLabel={exercise.isTimed ? 'Seconds' : 'Reps'}
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          max={999}
        />
      </View>
    </Sheet>
  );
}
