import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLAN_MEAL_MENU_COPY } from '@chefer/utils';
import { SlotOverflowButton } from '../tracker/slot-controls';

// FB7-11: the ONE compact action column on a plan card — swap (the most used
// action, one tap) over "…" (pin, ate something else, skip, add a side dish,
// remove). 44 pt wide, two 44 pt targets stacked, so the body keeps the width.

export function PlanMealActions({
  mealName,
  mealType,
  swapTestID,
  moreTestID,
  moreLabel,
  onSwap,
  onMore,
}: {
  mealName: string;
  mealType: string;
  swapTestID: string;
  moreTestID: string;
  /** Overrides "More actions for Dinner" (a side dish names itself). */
  moreLabel?: string;
  onSwap: () => void;
  onMore: () => void;
}) {
  return (
    <View className="w-11 items-center justify-center border-l border-border">
      <Pressable
        testID={swapTestID}
        accessibilityRole="button"
        accessibilityLabel={PLAN_MEAL_MENU_COPY.swap(mealName)}
        onPress={onSwap}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="swap-horizontal-outline" size={20} color="#944a00" />
      </Pressable>
      <SlotOverflowButton
        testID={moreTestID}
        mealType={mealType}
        {...(moreLabel !== undefined && { accessibilityLabel: moreLabel })}
        onPress={onMore}
        className="rounded-none"
      />
    </View>
  );
}
