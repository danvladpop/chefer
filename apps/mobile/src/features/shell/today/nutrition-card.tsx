import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  CalorieGauge,
  Celebration,
  MacroRow,
  ProgressBar,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { formatNumber, HIDE_NUMBERS_COPY, onPlanLine } from '@chefer/utils';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { BoardCard } from './parts';

// Today's and Your day's nutrition card (10 Oct redesign, boards Home and
// Tracker): the half-ring calorie gauge (eaten / left / target, over target
// handled by the primitive) over three macro rows. WP-08 protein-only users
// get the protein number and its row only — never a kcal figure. Lane E3
// "Hide numbers" users get no figure at all: the card becomes "Today so far",
// the planned meals eaten as qualitative progress.

export type MacroAmount = { value: number; target: number };

export interface NutritionCardProps {
  eatenKcal: number;
  targetKcal: number;
  protein: MacroAmount;
  carbs: MacroAmount;
  fat: MacroAmount;
  proteinOnly: boolean;
  /** WP-08: the per-meal protein guide ("30–40 g per meal"), protein-only mode. */
  proteinGuide?: string | undefined;
  /** "Your target" / "Suggested" (§2.11), when known. */
  targetLabel?: string | undefined;
  /** Above the gauge, e.g. the training-day note. */
  header?: ReactNode;
  /** Top-right of the card, e.g. "Why this number". */
  action?: ReactNode;
  /** Bump to fire the day-complete confetti over the gauge (MO-18). */
  celebrate?: number;
  /** Lane E3: planned meals eaten / planned today — what "Hide numbers" shows. */
  onPlan?: { eaten: number; planned: number };
  testID?: string;
}

export function NutritionCard({
  eatenKcal,
  targetKcal,
  protein,
  carbs,
  fat,
  proteinOnly,
  proteinGuide,
  targetLabel,
  header,
  action,
  celebrate = 0,
  onPlan,
  testID = 'nutrition-card',
}: NutritionCardProps) {
  const colors = useThemeColors();
  const { noNumbers } = useNumbersMode();
  if (noNumbers) {
    if (!onPlan) return null;
    return (
      <BoardCard testID={`${testID}-on-plan`}>
        {header}
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {HIDE_NUMBERS_COPY.onPlanTitle}
        </Text>
        <Text className="text-body text-label-secondary">
          {onPlanLine(onPlan.eaten, onPlan.planned)}
        </Text>
        {onPlan.planned > 0 ? (
          // MO-11 progress, a share of the plan — no nutrition figure.
          <ProgressBar
            testID={`${testID}-on-plan-bar`}
            progress={Math.min(1, onPlan.eaten / onPlan.planned)}
            accessibilityLabel={onPlanLine(onPlan.eaten, onPlan.planned)}
          />
        ) : null}
        <Celebration
          testID={`${testID}-celebration`}
          play={celebrate}
          colors={[colors.brand, colors.positive, colors.attention, colors.info]}
          origin={{ x: 0.5, y: 0.3 }}
        />
      </BoardCard>
    );
  }
  return (
    <BoardCard testID={testID}>
      {action ? <View className="absolute right-2 top-2 z-10">{action}</View> : null}
      {header}
      {proteinOnly ? (
        <View testID={`${testID}-protein-only`} className="items-center gap-0.5 pt-2">
          <Text
            className="text-display font-bold text-label"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {`${formatNumber(Math.round(protein.value))} g`}
          </Text>
          <Text className="text-caption text-label-secondary">
            {`of ${formatNumber(Math.round(protein.target))} g protein`}
          </Text>
        </View>
      ) : (
        <CalorieGauge
          testID={`${testID}-gauge`}
          value={eatenKcal}
          target={targetKcal}
          className="pt-2"
        />
      )}
      {targetLabel ? (
        <Text
          testID={`${testID}-target-label`}
          className="text-center text-caption text-label-tertiary"
        >
          {targetLabel}
        </Text>
      ) : null}
      <View className="gap-3">
        <MacroRow
          testID={`${testID}-protein`}
          macro="protein"
          value={protein.value}
          target={protein.target}
        />
        {proteinOnly ? null : (
          <>
            <MacroRow
              testID={`${testID}-carbs`}
              macro="carbs"
              value={carbs.value}
              target={carbs.target}
            />
            <MacroRow testID={`${testID}-fat`} macro="fat" value={fat.value} target={fat.target} />
          </>
        )}
      </View>
      {proteinOnly && proteinGuide ? (
        <Text testID={`${testID}-protein-guide`} className="text-caption text-label-secondary">
          {proteinGuide}
        </Text>
      ) : null}
      <Celebration
        testID={`${testID}-celebration`}
        play={celebrate}
        colors={[colors.brand, colors.positive, colors.attention, colors.info]}
        origin={{ x: 0.5, y: 0.3 }}
      />
    </BoardCard>
  );
}
