import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { EquipmentProfile, ExerciseMeta, ProgressionDto, WeightUnit } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { formatLoad } from '@chefer/utils';
import { TargetFields, TargetKeypad, type TargetEditing } from '../workout/target-fields';
import { FALLBACK_EQUIPMENT } from '../workout/workout-model';
import { buildOverridePayload, type SetOverrideInput } from './override-payload';

// Next-session target override (D5c, gym_plan.md §1.3 "Routine tab"): the same
// weight/reps editor as the summary's Adjust sheet (UX-GYM-28 — equipment-aware
// steps, tap a value to type it), "Save target" / "Reset to suggestion". One
// rep target applies to every working set — the same simplification the
// setOverride API makes (an array, all equal here).

export interface OverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  exercise: ExerciseMeta;
  unit: WeightUnit;
  repBucket: string;
  progression: ProgressionDto;
  /** Bar/plate/dumbbell inventory for the weight steps; a generic gym when omitted. */
  profile?: EquipmentProfile;
  onSave: (payload: SetOverrideInput) => void;
  onReset: () => void;
  saving?: boolean;
  testID?: string;
}

export function OverrideSheet({
  visible,
  onClose,
  exercise,
  unit,
  repBucket,
  progression,
  profile = FALLBACK_EQUIPMENT,
  onSave,
  onReset,
  saving = false,
  testID = 'routine-override-sheet',
}: OverrideSheetProps) {
  const { suggestion, override } = progression;
  const baseWeightKg = override?.weightKg ?? suggestion.weightKg;
  const baseReps = override?.reps[0] ?? suggestion.reps[0] ?? exercise.repMin;

  // Weight is held in kg (the unit the API stores) — the fields format it in `unit`.
  const [weightKg, setWeightKg] = useState(baseWeightKg);
  const [reps, setReps] = useState(baseReps);
  const [editing, setEditing] = useState<TargetEditing>(null);

  useEffect(() => {
    if (!visible) return;
    setWeightKg(baseWeightKg);
    setReps(baseReps);
  }, [visible, baseWeightKg, baseReps]);

  return (
    <>
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
                    unit: 'KG',
                    weightDisplay: weightKg,
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
        <TargetFields
          testID={testID}
          meta={exercise}
          unit={unit}
          profile={profile}
          weightKg={weightKg}
          onWeightKg={setWeightKg}
          repsFirst={reps}
          onRepsFirst={setReps}
          allReps={Array.from({ length: Math.max(1, Math.round(suggestion.sets)) }, () => reps)}
          onEdit={setEditing}
        />
      </Sheet>
      <TargetKeypad
        editing={editing}
        onClose={() => setEditing(null)}
        meta={exercise}
        unit={unit}
        profile={profile}
        weightKg={weightKg}
        onWeightKg={setWeightKg}
        repsFirst={reps}
        onRepsFirst={setReps}
      />
    </>
  );
}
