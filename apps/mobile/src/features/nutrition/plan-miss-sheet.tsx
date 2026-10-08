import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import {
  capProteinScaleFactor,
  formatKcal,
  isLossGoal,
  userFacingErrorMessage,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// ─── PlanMissSheet (§2.11, T-11.3) ─────────────────────────────────────────────
// What to do about a planned day that lands under or over its target. Three
// honest choices, none pushed: scale the day's portions (previewed through
// `mealPlan.scaleDay` apply=false, committed with apply=true), add a snack
// (never offered on a LOSE_WEIGHT goal, nor when the goal is still loading),
// or keep the day as it is. A protein-gap fix on a weight-loss goal is capped
// at +10 % of the day (UX-PLAN-08: never "Bigger portions (+503 kcal)") and the
// sheet points at a higher-protein swap or snack instead (WP-07).

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
  /** `Find a higher-protein swap` (loss goal, protein gap) — the caller runs the week rebalance check. */
  onRebalance?: () => void;
}

/** The portion factor that would land the day on target, or null when nothing useful. */
export function missScaleFactor(input: {
  kcal: number;
  protein: number;
  calorieTarget: number | undefined;
  proteinGapG: number | undefined;
  /** The user's goal: a loss goal caps a protein-driven increase (UX-PLAN-08). */
  goal?: string | null | undefined;
}): number | null {
  const { kcal, protein, calorieTarget, proteinGapG, goal } = input;
  let raw: number | null = null;
  let proteinDriven = false;
  if (calorieTarget && kcal > 0 && Math.abs(kcal - calorieTarget) / calorieTarget > 0.15) {
    raw = calorieTarget / kcal;
  } else if (proteinGapG && proteinGapG > 0 && protein > 0) {
    raw = (protein + proteinGapG) / protein;
    proteinDriven = true;
  }
  if (raw === null) return null;
  if (proteinDriven) {
    // The server's bounds first, then the loss-goal cap (null = nothing left worth offering).
    return capProteinScaleFactor(Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw)), goal);
  }
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
  onRebalance,
}: PlanMissSheetProps) {
  // WP-08: protein-only mode only ever judges a day by its protein (a calorie
  // miss is not offered), and states no calorie figure.
  const { proteinOnly } = useNumbersMode();
  const judgedTarget = proteinOnly ? undefined : calorieTarget;
  const factor = useMemo(
    () => missScaleFactor({ kcal, protein, calorieTarget: judgedTarget, proteinGapG, goal }),
    [kcal, protein, judgedTarget, proteinGapG, goal],
  );
  // A protein-driven miss on a loss goal: bigger portions are capped, so lead
  // with the higher-protein routes instead.
  const calorieMiss =
    !!judgedTarget && kcal > 0 && Math.abs(kcal - judgedTarget) / judgedTarget > 0.15;
  const lossProteinGap = isLossGoal(goal) && !calorieMiss && !!proteinGapG && proteinGapG > 0;
  const under = judgedTarget ? kcal < judgedTarget : true;
  const [preview, setPreview] = useState<{ kcal: number; protein: number } | null>(null);

  const previewMutation = trpc.mealPlan.scaleDay.useMutation({
    meta: { silent: true },
    onSuccess: (data) => setPreview({ kcal: data.kcal, protein: data.protein }),
  });
  const applyMutation = trpc.mealPlan.scaleDay.useMutation({
    meta: { silent: true },
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
        {proteinOnly
          ? proteinGapG && proteinGapG > 0
            ? `${dayName} is about ${proteinGapG} g short on protein. You can leave it as it is.`
            : `${dayName} is planned at ${protein} g protein. You can leave it as it is.`
          : calorieTarget
            ? `${dayName} is planned at ${formatKcal(kcal)} kcal against a target of ${formatKcal(calorieTarget)}. You can leave it as it is.`
            : `${dayName} is planned at ${formatKcal(kcal)} kcal. You can leave it as it is.`}
      </Text>

      <View className="gap-3 pb-2">
        {lossProteinGap && (
          <View className="gap-1">
            <Text testID="plan-miss-protein-hint" variant="muted" className="text-sm">
              A higher-protein swap or a protein snack closes this gap without many extra calories.
            </Text>
            {onRebalance && (
              <Button
                testID="plan-miss-rebalance"
                variant="outline"
                onPress={() => {
                  onClose();
                  onRebalance();
                }}
              >
                Find a higher-protein swap
              </Button>
            )}
          </View>
        )}
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
                {proteinOnly
                  ? `Would be ${preview.protein} g protein`
                  : `Would be ${formatKcal(preview.kcal)} kcal · ${preview.protein} g protein`}
              </Text>
            ) : previewMutation.isError ? (
              <Text variant="muted" className="text-xs">
                Couldn’t work out the new numbers just now.
              </Text>
            ) : null}
            {applyMutation.isError && (
              <Text className="text-xs text-red-600">
                {userFacingErrorMessage(applyMutation.error) ||
                  'Could not change the portions — try again.'}
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
