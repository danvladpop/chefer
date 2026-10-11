import { ScrollView, View } from 'react-native';
import { DENSE_MAX_FONT_SCALE, haptics, PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// FB7-07 (tester feedback 2026-10-07): the Exercises tab and the swap/add
// picker used to stack up to three wrapping chip rows (muscles, "Mine",
// equipment) — and collapse them to one strip while the keyboard was up
// (UX-05 A3, T-05.A3.1). The filters are now ONE horizontally scrolling row
// all the time (Equipment ▾ → Mine → Clear → muscle chips), so there is
// nothing left to collapse and the keyboard never hides results.
//
// UX-GYM-08: the container deliberately has NO `layout={LinearTransition}` —
// on Android that layout animation drew the chip block over the search box.

export interface CollapsibleChipFiltersProps {
  /** The chips of the row (Chip / ChipGroup with `flex-nowrap` / EquipmentFilterChip). */
  children: React.ReactNode;
  testID?: string;
}

export function CollapsibleChipFilters({ children, testID }: CollapsibleChipFiltersProps) {
  return (
    <View testID={testID}>
      <ScrollView
        testID={testID ? `${testID}-scroll` : undefined}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-mx-4"
        contentContainerClassName="flex-row items-center gap-2 px-4"
      >
        {children}
      </ScrollView>
    </View>
  );
}

// 10 Oct redesign: the filter row's pills in the shell's roles — a brand-tint
// wash, brand fill while selected (the kit `Chip` still draws the old
// palette). 44 pt tall; MO-01 press scale + a selection haptic like `Chip`.

export interface FilterPillProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** The shared pill look, for chips that draw their own content (EquipmentFilterChip). */
export function filterPillClassName(selected: boolean): string {
  return cn(
    'min-h-11 flex-row items-center justify-center gap-1 rounded-full px-4 py-2',
    selected ? 'bg-brand' : 'bg-brand-tint',
  );
}

export function filterPillTextClassName(selected: boolean): string {
  return cn('text-subhead font-semibold', selected ? 'text-brand-on' : 'text-brand');
}

export function FilterPill({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: FilterPillProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={filterPillClassName(selected)}
    >
      <Text
        className={filterPillTextClassName(selected)}
        maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
