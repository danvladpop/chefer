import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Chip, SegmentedControl, Text } from '@chefer/ui-mobile';
import {
  EAT_OUT_CUISINE_LABELS,
  EAT_OUT_CUISINES,
  EAT_OUT_SIZE_HINTS,
  EAT_OUT_SIZE_LABELS,
  EAT_OUT_SIZES,
  eatOutEstimate,
  eatOutLogValues,
  eatOutMealName,
  formatEatOutKcal,
  formatEatOutProtein,
  formatKcal,
  type EatOutCuisine,
  type EatOutSize,
  type SlotRef,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { proteinLabel } from '../numbers-mode/numbers-mode-copy';
import { ScanMealCard } from './scan-meal-card';
import type { ReplaceInput } from './use-slot-actions';

// The body of the "Ate something else" sheet (WP-06, Food 1): three ways to say
// what you had instead of a planned meal. Everything logs a custom entry that
// takes over the slot (`replacesSlot`), so the planned meal leaves the day's
// planned totals and the replacement's numbers count as eaten.
//
//  1. Quick estimate — free, no AI: a cuisine and a size give a RANGE (rounded
//     up for restaurant food); the middle is logged, carbs and fat unknown.
//  2. Recent — something you logged lately, in one tap. A recipe from Recent is
//     logged as a custom entry with the recipe's numbers (the planned slot is
//     replaced, not ticked), named after the recipe.
//  3. Describe or snap a photo — the existing Log sheet and Snap card, aimed at
//     the slot.

const SIZE_OPTIONS = EAT_OUT_SIZES.map((value) => ({
  value,
  label: EAT_OUT_SIZE_LABELS[value],
  testID: `ate-else-size-${value}`,
}));

const RECENTS_SHOWN = 5;

export function AteSomethingElseBody({
  visible,
  date,
  slot,
  onReplace,
  onDescribe,
  onScanned,
}: {
  visible: boolean;
  date: string;
  slot: SlotRef;
  onReplace: (input: ReplaceInput) => void;
  /** Hands over to the Log sheet, aimed at the slot. */
  onDescribe: () => void;
  /** A Snap log landed. */
  onScanned: () => void;
}) {
  // WP-08: protein-only mode asks protein first and never shows a calorie figure.
  const { proteinOnly } = useNumbersMode();
  const [cuisine, setCuisine] = useState<EatOutCuisine | null>(null);
  const [size, setSize] = useState<EatOutSize>('normal');
  const recents = trpc.tracker.recents.useQuery({ limit: 15 }, { enabled: visible });
  const recentRows = (recents.data ?? []).filter((r) => r.kcal > 0).slice(0, RECENTS_SHOWN);

  const estimate = cuisine ? eatOutEstimate(cuisine, size) : null;

  const logEstimate = () => {
    if (!cuisine || !estimate) return;
    const { kcal, protein } = eatOutLogValues(estimate);
    onReplace({
      slot,
      name: eatOutMealName(cuisine, size),
      estimatedBy: 'manual',
      kcal,
      protein,
      carbs: 0,
      fat: 0,
      unknownMacros: ['carbs', 'fat'],
    });
  };

  const header = (label: string) => (
    <Text
      accessibilityRole="header"
      className="text-xs font-semibold uppercase tracking-widest text-gray-500"
    >
      {label}
    </Text>
  );

  return (
    <View className="gap-5">
      <View className="gap-3">
        {header('Quick estimate')}
        <View testID="ate-else-cuisines" className="flex-row flex-wrap gap-2">
          {EAT_OUT_CUISINES.map((c) => (
            <Chip
              key={c}
              testID={`ate-else-cuisine-${c}`}
              label={EAT_OUT_CUISINE_LABELS[c]}
              selected={cuisine === c}
              onPress={() => setCuisine(c)}
            />
          ))}
        </View>
        <SegmentedControl
          size="sm"
          options={SIZE_OPTIONS}
          value={size}
          onChange={setSize}
          accessibilityLabel="Size"
          testID="ate-else-size"
        />
        {cuisine && (
          <Text testID="ate-else-size-hint" className="text-xs text-gray-500">
            {EAT_OUT_SIZE_HINTS[cuisine][size]}
          </Text>
        )}
        <Text
          testID="ate-else-estimate"
          accessibilityLiveRegion="polite"
          className="text-sm font-semibold text-gray-800"
        >
          {estimate
            ? proteinOnly
              ? formatEatOutProtein(estimate)
              : `${formatEatOutKcal(estimate)} · ${formatEatOutProtein(estimate)}`
            : 'Pick what you had for a rough estimate.'}
        </Text>
        <Button testID="ate-else-log-it" disabled={!estimate} onPress={logEstimate}>
          Log it
        </Button>
      </View>

      {recentRows.length > 0 && (
        <View className="gap-2">
          {header('Recent')}
          {recentRows.map((r) => (
            <Pressable
              key={r.key}
              testID={`ate-else-recent-${r.key}`}
              accessibilityRole="button"
              accessibilityLabel={
                proteinOnly
                  ? `Log ${r.name}, about ${proteinLabel(r.protein)}, as what you had`
                  : `Log ${r.name}, about ${formatKcal(r.kcal)} kilocalories, as what you had`
              }
              onPress={() =>
                onReplace({
                  slot,
                  name: r.name,
                  estimatedBy: r.estimatedBy ?? 'manual',
                  kcal: r.kcal,
                  protein: r.protein,
                  carbs: r.carbs,
                  fat: r.fat,
                  ...(r.unknownMacros && { unknownMacros: r.unknownMacros }),
                })
              }
              className="min-h-11 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                {r.name}
              </Text>
              <Text className="text-xs text-gray-500">
                {proteinOnly ? `≈ ${proteinLabel(r.protein)}` : `≈ ${formatKcal(r.kcal)} kcal`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View className="gap-3">
        {header('Describe it or snap a photo')}
        <Button testID="ate-else-describe" variant="outline" onPress={onDescribe}>
          Describe it
        </Button>
        <ScanMealCard date={date} replacesSlot={slot} onLogged={onScanned} />
      </View>
    </View>
  );
}
