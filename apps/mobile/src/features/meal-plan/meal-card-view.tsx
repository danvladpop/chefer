import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { getRecipeImageUrl } from '../../lib/recipe-image';
import { MealTypeBadge } from '../dashboard/components/meal-type-badge';

// ─── MealCardView: the presentational meal card ───────────────────────────────
// Photo on the left, then the meal-type eyebrow (+ any badges), the name, an
// optional block under the name, and a bottom meta line. It knows nothing
// about plans, swaps or safety: `PlanMealCard` (the owner's Plan tab and the
// history plan detail) wraps it with its chips, pin and swap column, and the
// Following week view (`friends/profile/food/friend-week-view.tsx`) uses it
// read-only (UX §3.2: no swap, pin, safety chip, tailoring mark or cost).
//
// Pressable only when `onPress` is given. Without it the card is one plain
// accessible element (a `Hidden recipe` placeholder is never a button, UX §13).

export type MealCardViewProps = {
  testID: string;
  mealType: string;
  name: string;
  /** Recipe photo (null → the shared fallback photo). Ignored when `placeholder`. */
  imageUrl: string | null | undefined;
  /** A neutral placeholder instead of a photo (an auto-hidden recipe). */
  placeholder?: boolean;
  /** Next to the meal-type eyebrow (leftovers, `Your pick`, portion…). */
  badges?: ReactNode;
  /** Under the name (chips, the portion line…). */
  children?: ReactNode;
  /** The bottom line (time · kcal, or the macro line). */
  meta?: ReactNode;
  /** An action column on the right (the Plan tab's swap). */
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Only when the card is not pressable: the whole card's accessible name. */
  accessibilityLabel?: string;
};

export function MealCardView({
  testID,
  mealType,
  name,
  imageUrl,
  placeholder = false,
  badges,
  children,
  meta,
  trailing,
  onPress,
  onLongPress,
  accessibilityLabel,
}: MealCardViewProps) {
  const body = (
    <>
      {placeholder ? (
        <View
          testID={`${testID}-placeholder`}
          className="h-28 w-24 items-center justify-center bg-muted"
        >
          <Ionicons name="eye-off-outline" size={22} color="#9ca3af" />
        </View>
      ) : (
        <Image
          source={{ uri: getRecipeImageUrl(imageUrl) }}
          className="h-28 w-24"
          resizeMode="cover"
        />
      )}
      <View className="min-w-0 flex-1 justify-between p-3">
        <View className="gap-1">
          {/* UX-PLAN-13: the eyebrow + badges wrap instead of "Your pick" being
              cut by the portion chip. */}
          <View
            testID={`${testID}-badges`}
            className="min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1"
          >
            <MealTypeBadge mealType={mealType} />
            {badges}
          </View>
          <Text numberOfLines={2} className="text-sm font-semibold text-gray-900">
            {name}
          </Text>
          {children}
        </View>
        {meta}
      </View>
      {trailing}
    </>
  );

  const frame = 'flex-row overflow-hidden rounded-2xl border border-border bg-card';
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        onLongPress={onLongPress}
        className={frame}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={accessibilityLabel} className={frame}>
      {body}
    </View>
  );
}
