import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { moreActionsLabel } from './slot-copy';

// Small pieces every planned-slot surface shares (WP-06): the overflow button
// next to "I ate this", and the one-line state a replaced or skipped slot shows
// in its place. Presentational only — the sheets and writes live in slot-flow.

/**
 * The "…" next to "I ate this" / the tick: opens the slot's actions ("Ate
 * something else", "Skipped it"). 44 pt hit area, named "More actions for Dinner".
 */
export function SlotOverflowButton({
  mealType,
  onPress,
  disabled = false,
  testID,
  className,
}: {
  mealType: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  className?: string;
}) {
  return (
    <Pressable
      {...(testID !== undefined && { testID })}
      accessibilityRole="button"
      accessibilityLabel={moreActionsLabel(mealType)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={0}
      className={cn('h-11 w-11 items-center justify-center rounded-full', className)}
    >
      <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
    </Pressable>
  );
}

/**
 * What a replaced slot ("You had: Shawarma · normal (≈ 650 kcal)") or a skipped
 * one ("Skipped") reads, with its Remove / Undo. Muted, never a warning colour.
 */
export function SlotStatusLine({
  text,
  actionLabel,
  onAction,
  busy = false,
  testID,
  className,
}: {
  text: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  busy?: boolean;
  testID: string;
  className?: string;
}) {
  return (
    <View testID={testID} className={cn('flex-row items-center gap-2', className)}>
      <Text testID={`${testID}-text`} className="min-w-0 flex-1 text-sm text-gray-600">
        {text}
      </Text>
      {actionLabel && onAction && (
        <Pressable
          testID={`${testID}-action`}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${text}`}
          disabled={busy}
          onPress={onAction}
          className="min-h-11 min-w-11 items-center justify-center px-2"
        >
          <Text className="text-sm font-semibold text-primary">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
