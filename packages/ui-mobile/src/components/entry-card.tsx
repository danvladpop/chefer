import type { ReactNode } from 'react';
import { View } from 'react-native';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { Text } from './text';

// The way into a collection you add to (10 Oct redesign: "the cookbook
// button should be more visible and in the same way the Routines button").
// Cookbook in Meals and Routines in Train use this one card, so the two
// entry points carry the same weight: the card opens the collection, the
// white pill adds a new one straight away.

export interface EntryCardProps {
  /** The icon, already sized (~22pt) and tinted on-brand by the caller. */
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** The add pill's label, e.g. "Recipe" (drawn as "+ Recipe"). */
  addLabel: string;
  /** Spoken label for the add pill, e.g. "New recipe". */
  addAccessibilityLabel: string;
  onAdd: () => void;
  /** The "+" glyph for the pill, sized ~18pt and tinted brand. */
  addIcon?: ReactNode;
  testID?: string;
}

export function EntryCard({
  icon,
  title,
  subtitle,
  onPress,
  addLabel,
  addAccessibilityLabel,
  onAdd,
  addIcon,
  testID,
}: EntryCardProps) {
  return (
    <View
      testID={testID}
      className="flex-row items-center gap-3 rounded-card bg-brand-tint py-2.5 pl-4 pr-2.5"
    >
      <PressableScale
        testID={testID ? `${testID}-open` : undefined}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress}
        pressScale="card"
        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3"
      >
        <View className="h-11 w-11 items-center justify-center rounded-control bg-brand">
          {icon}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-headline font-bold text-label">
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="text-caption text-label-secondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <PressableScale
        testID={testID ? `${testID}-add` : undefined}
        accessibilityRole="button"
        accessibilityLabel={addAccessibilityLabel}
        onPress={() => {
          haptics.selection();
          onAdd();
        }}
        className="min-h-11 flex-row items-center gap-1 rounded-full bg-surface px-3.5"
      >
        {addIcon}
        <Text className="text-callout font-semibold text-brand">{addLabel}</Text>
      </PressableScale>
    </View>
  );
}
