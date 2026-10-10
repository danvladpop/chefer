import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { useThemeColors } from '../hooks/use-theme-colors';
import { ProgressBar } from './progress-bar';
import { Text } from './text';

// Macro rows and tiles (10 Oct redesign). The emoji is decoration next to the
// word — never instead of it — so it is hidden from screen readers and every
// value is spoken with its name. Bars are brand; over target they turn
// `attention` and the row says "N g over" in words (colour is never the only
// signal, and numbers are never red — F8).

export type MacroKey = 'protein' | 'carbs' | 'fat';

export const MACRO_META: Record<MacroKey, { label: string; emoji: string }> = {
  protein: { label: 'Protein', emoji: '🍖' },
  carbs: { label: 'Carbs', emoji: '🍞' },
  fat: { label: 'Fat', emoji: '🥑' },
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export interface MacroRowProps {
  macro: MacroKey;
  /** Grams so far. */
  value: number;
  /** Target grams; 0 / missing shows the value alone, without a bar. */
  target?: number;
  className?: string;
  testID?: string;
}

/** "🍖 Protein · 82 / 140 g" over a progress bar. */
export function MacroRow({ macro, value, target, className, testID }: MacroRowProps) {
  const colors = useThemeColors();
  const { label, emoji } = MACRO_META[macro];
  const hasTarget = target !== undefined && target > 0;
  const overBy = hasTarget ? Math.round(value - target) : 0;
  const spoken = hasTarget
    ? `${label}, ${fmt(value)} of ${fmt(target)} grams${overBy > 0 ? `, ${overBy} over` : ''}`
    : `${label}, ${fmt(value)} grams`;
  return (
    <View testID={testID} accessible accessibilityLabel={spoken} className={cn('gap-1', className)}>
      <View className="flex-row items-center gap-2">
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          className="w-6 text-center text-title3"
        >
          {emoji}
        </Text>
        <Text className="min-w-0 flex-1 text-callout font-semibold text-label">{label}</Text>
        {overBy > 0 ? (
          <Text
            testID={testID ? `${testID}-over` : undefined}
            className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-attention"
          >
            {overBy} g over
          </Text>
        ) : null}
        <Text
          className="text-callout text-label-tertiary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          <Text className="font-bold text-label">{fmt(value)}</Text>
          {hasTarget ? ` / ${fmt(target)} g` : ' g'}
        </Text>
      </View>
      {hasTarget ? (
        <ProgressBar
          progress={value / target}
          color={colors.brand}
          overColor={colors.attention}
          capColor={colors.attention}
          className="h-2 bg-surface-sunken"
        />
      ) : null}
    </View>
  );
}

export interface MacroTilesProps {
  protein: number;
  carbs: number;
  fat: number;
  className?: string;
  testID?: string;
}

/** Three big, readable macro totals side by side (Meals day totals). */
export function MacroTiles({ protein, carbs, fat, className, testID }: MacroTilesProps) {
  const values: Record<MacroKey, number> = { protein, carbs, fat };
  return (
    <View testID={testID} className={cn('flex-row gap-2', className)}>
      {(Object.keys(MACRO_META) as MacroKey[]).map((key) => (
        <View
          key={key}
          accessible
          accessibilityLabel={`${MACRO_META[key].label}, ${fmt(values[key])} grams`}
          className="min-w-0 flex-1 items-center gap-0.5 rounded-control bg-canvas px-2 py-2.5"
        >
          <Text importantForAccessibility="no" accessibilityElementsHidden className="text-title3">
            {MACRO_META[key].emoji}
          </Text>
          <Text
            className="text-title3 font-bold text-label"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {fmt(values[key])} g
          </Text>
          <Text className="text-caption text-label-secondary">{MACRO_META[key].label}</Text>
        </View>
      ))}
    </View>
  );
}
