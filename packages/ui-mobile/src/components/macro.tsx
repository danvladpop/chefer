import { View } from 'react-native';
import { cn, formatNumber } from '@chefer/utils';
import { useThemeColors } from '../hooks/use-theme-colors';
import { ProgressBar } from './progress-bar';
import { Text } from './text';

// Macro rows and tiles (10 Oct redesign). The emoji is decoration next to the
// word — never instead of it — so it is hidden from screen readers and every
// value is spoken with its name. Bars are brand, over target too: the row
// says "N g over" in neutral words (never an alarm colour or red — F8; lane E3:
// eating-disorder-safe in every mode).

export type MacroKey = 'protein' | 'carbs' | 'fat';

export const MACRO_META: Record<MacroKey, { label: string; emoji: string }> = {
  protein: { label: 'Protein', emoji: '🍖' },
  carbs: { label: 'Carbs', emoji: '🍞' },
  fat: { label: 'Fat', emoji: '🥑' },
};

// One formatter for the app (WP-11): device locale via Intl, like formatKcal.
const fmt = (n: number) => formatNumber(Math.round(n));

/** What a macro's spoken name is built from, already formatted. */
export interface MacroFigures {
  name: string;
  value: string;
  /** Absent when there is no target. */
  target?: string;
  /** Present only once over target. */
  overBy?: string;
  /** The grams the sentence ends on (the target, else the value), for a plural. */
  grams: number;
}

/**
 * A macro's words. The kit stays language-free: the app passes translated
 * labels; the English defaults below serve every other caller.
 */
export interface MacroLabels {
  /** "Protein". */
  name: string;
  /** The neutral chip once over target: "4 g over". */
  over: (overBy: string) => string;
  /** The one accessibility sentence for the row or tile. */
  spoken: (figures: MacroFigures) => string;
}

function englishSpoken({ name, value, target, overBy }: MacroFigures): string {
  if (target === undefined) return `${name}, ${value} grams`;
  return `${name}, ${value} of ${target} grams${overBy === undefined ? '' : `, ${overBy} over`}`;
}

function macroLabels(macro: MacroKey, labels: Partial<MacroLabels> | undefined): MacroLabels {
  return {
    name: MACRO_META[macro].label,
    over: (overBy) => `${overBy} g over`,
    spoken: englishSpoken,
    ...labels,
  };
}

export interface MacroRowProps {
  macro: MacroKey;
  /** Grams so far. */
  value: number;
  /** Target grams; 0 / missing shows the value alone, without a bar. */
  target?: number;
  /** Translated words (default English). */
  labels?: Partial<MacroLabels>;
  className?: string;
  testID?: string;
}

/** "🍖 Protein · 82 / 140 g" over a progress bar. */
export function MacroRow({ macro, value, target, labels, className, testID }: MacroRowProps) {
  const colors = useThemeColors();
  const { emoji } = MACRO_META[macro];
  const words = macroLabels(macro, labels);
  const label = words.name;
  const hasTarget = target !== undefined && target > 0;
  const overBy = hasTarget ? Math.round(value - target) : 0;
  const spoken = words.spoken({
    name: label,
    value: fmt(value),
    ...(hasTarget ? { target: fmt(target) } : {}),
    ...(overBy > 0 ? { overBy: String(overBy) } : {}),
    grams: Math.round(hasTarget ? target : value),
  });
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
            className="rounded-full bg-surface-sunken px-2 text-caption text-label-secondary"
          >
            {words.over(String(overBy))}
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
  /** Translated words per macro (default English). */
  labels?: Partial<Record<MacroKey, Partial<MacroLabels>>>;
  className?: string;
  testID?: string;
}

/** Three big, readable macro totals side by side (Meals day totals). */
export function MacroTiles({ protein, carbs, fat, labels, className, testID }: MacroTilesProps) {
  const values: Record<MacroKey, number> = { protein, carbs, fat };
  return (
    <View testID={testID} className={cn('flex-row gap-2', className)}>
      {(Object.keys(MACRO_META) as MacroKey[]).map((key) => {
        const words = macroLabels(key, labels?.[key]);
        return (
          <View
            key={key}
            accessible
            accessibilityLabel={words.spoken({
              name: words.name,
              value: fmt(values[key]),
              grams: Math.round(values[key]),
            })}
            className="min-w-0 flex-1 items-center gap-0.5 rounded-control bg-canvas px-2 py-2.5"
          >
            <Text
              importantForAccessibility="no"
              accessibilityElementsHidden
              className="text-title3"
            >
              {MACRO_META[key].emoji}
            </Text>
            <Text
              className="text-title3 font-bold text-label"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {fmt(values[key])} g
            </Text>
            <Text className="text-caption text-label-secondary">{words.name}</Text>
          </View>
        );
      })}
    </View>
  );
}
