import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CalorieGauge, Celebration, MacroRow, Text, useThemeColors } from '@chefer/ui-mobile';
import { formatNumber } from '@chefer/utils';
import { BoardCard } from './parts';

// Today's and Your day's nutrition card (10 Oct redesign, boards Home and
// Tracker): the half-ring calorie gauge (eaten / left / target, over target
// handled by the primitive) over three macro rows. WP-08 protein-only users
// get the protein number and its row only — never a kcal figure.

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
  testID = 'nutrition-card',
}: NutritionCardProps) {
  const colors = useThemeColors();
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
