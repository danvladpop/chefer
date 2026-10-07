import { ScrollView, View } from 'react-native';

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
