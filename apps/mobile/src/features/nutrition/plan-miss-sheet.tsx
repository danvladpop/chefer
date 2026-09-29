import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';

// ─── PlanMissSheet (§2.11, T-11.3) ─────────────────────────────────────────────
// What to do about a planned day that lands under or over its target. Three
// honest choices, none pushed: scale the day's portions (previewed through
// `mealPlan.scaleDay` apply=false, committed with apply=true), add a snack
// (never offered on a LOSE_WEIGHT goal, nor when the goal is still loading),
// or keep the day as it is.

/** The server's scaleDay bounds. */
const MIN_FACTOR = 0.75;
const MAX_FACTOR = 1.5;

export interface PlanMissSheetProps {
  visible: boolean;
  onClose: () => void;
  planId: string;
  dayOfWeek: number;
  /** "Tuesday". */
  dayName: string;
  /** The day's planned kcal / protein (portion-aware) and its target. */
  kcal: number;
  protein: number;
  calorieTarget: number | undefined;
  proteinGapG?: number | undefined;
  /**
   * The user's goal (`targets.get().inputs.goal`): `undefined` while unknown —
   * `Add a snack` stays hidden until it is; `null` = no goal set.
   */
  goal: string | null | undefined;
  /** After `apply` succeeded — the caller refreshes the plan. */
  onApplied: () => void;
  /** `Add a snack` — the caller opens its snack flow. */
  onAddSnack: () => void;
}

/** The portion factor that would land the day on target, or null when nothing useful. */
export function missScaleFactor(input: {
  kcal: number;
  protein: number;
  calorieTarget: number | undefined;
  proteinGapG: number | undefined;
}): number | null {
  const { kcal, protein, calorieTarget, proteinGapG } = input;
  let raw: number | null = null;
  if (calorieTarget && kcal > 0 && Math.abs(kcal - calorieTarget) / calorieTarget > 0.15) {
    raw = calorieTarget / kcal;
  } else if (proteinGapG && proteinGapG > 0 && protein > 0) {
    raw = (protein + proteinGapG) / protein;
  }
  if (raw === null) return null;
  const clamped = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw));
  const factor = Math.round(clamped * 100) / 100;
  return Math.abs(factor - 1) < 0.03 ? null : factor;
}

export function PlanMissSheet({
  visible,
  onClose,
  planId,
  dayOfWeek,
  dayName,
  kcal,
  protein,
  calorieTarget,
  proteinGapG,
  goal,
  onApplied,
  onAddSnack,
}: PlanMissSheetProps) {
  const factor = useMemo(
    () => missScaleFactor({ kcal, protein, calorieTarget, proteinGapG }),
    [kcal, protein, calorieTarget, proteinGapG],
  );
  const under = calorieTarget ? kcal < calorieTarget : true;
  const [preview, setPreview] = useState<{ kcal: number; protein: number } | null>(null);

  const previewMutation = trpc.mealPlan.scaleDay.useMutation({
    onSuccess: (data) => setPreview({ kcal: data.kcal, protein: data.protein }),
  });
  const applyMutation = trpc.mealPlan.scaleDay.useMutation({
    onSuccess: () => {
      onApplied();
      onClose();
    },
  });

  // Preview once per open (and when the factor changes), never on a closed sheet.
  useEffect(() => {
    if (!visible) {
      setPreview(null);
      return;
    }
    if (factor !== null) {
      previewMutation.mutate({ planId, dayOfWeek, factor, apply: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on open / factor change only
  }, [visible, factor, planId, dayOfWeek]);

  // A snack only ever adds food: never on a weight-loss goal, never when unsure.
  const canAddSnack = under && goal !== undefined && goal !== 'LOSE_WEIGHT';
  const biggerLabel = under ? 'Bigger portions' : 'Smaller portions';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={dayName}
      title="Adjust this day"
      testID="plan-miss-sheet"
    >
      <Text variant="muted" className="text-sm">
        {calorieTarget
          ? `${dayName} is planned at ${kcal.toLocaleString('en-GB')} kcal against a target of ${calorieTarget.toLocaleString('en-GB')}. You can leave it as it is.`
          : `${dayName} is planned at ${kcal.toLocaleString('en-GB')} kcal. You can leave it as it is.`}
      </Text>

      <View className="gap-3 pb-2">
        {factor !== null && (
          <View className="gap-1">
            <Button
              testID="plan-miss-portions"
              variant="outline"
              loading={applyMutation.isPending}
              disabled={preview === null}
              onPress={() => applyMutation.mutate({ planId, dayOfWeek, factor, apply: true })}
            >
              {biggerLabel}
            </Button>
            {previewMutation.isPending && preview === null ? (
              <ActivityIndicator size="small" />
            ) : preview ? (
              <Text testID="plan-miss-preview" variant="muted" className="text-xs">
                {`Would be ${preview.kcal.toLocaleString('en-GB')} kcal · ${preview.protein} g protein`}
              </Text>
            ) : previewMutation.isError ? (
              <Text variant="muted" className="text-xs">
                Couldn’t work out the new numbers just now.
              </Text>
            ) : null}
            {applyMutation.isError && (
              <Text className="text-xs text-red-600">
                {applyMutation.error.message || 'Could not change the portions — try again.'}
              </Text>
            )}
          </View>
        )}
        {canAddSnack && (
          <Button
            testID="plan-miss-snack"
            variant="outline"
            onPress={() => {
              onClose();
              onAddSnack();
            }}
          >
            Add a snack
          </Button>
        )}
        <Button testID="plan-miss-keep" variant="ghost" onPress={onClose}>
          Keep it
        </Button>
      </View>
    </Sheet>
  );
}
