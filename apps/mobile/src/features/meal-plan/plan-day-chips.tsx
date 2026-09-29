import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanTrainingDay } from '@chefer/types';
import { colors, DENSE_MAX_FONT_SCALE, Text } from '@chefer/ui-mobile';
import {
  cn,
  tailoringDayLabel,
  tailoringDayState,
  trainingChipA11y,
  trainingGlyph,
} from '@chefer/utils';
import { TailoringDayMark } from './tailoring-banner';

// The Plan tab's Mon–Sun chip strip. A training day (T-06.4) swaps the meal
// dot for a 10pt barbell (or a walking figure for run days) — only on the
// weekdays in `trainingDays`, and its accessible name says so
// ("Wednesday, training day"). Tailoring marks keep priority over the glyph.

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type PlanForChips = {
  days: { dayOfWeek: number; meals: readonly unknown[] }[];
  tailoring?: Parameters<typeof tailoringDayState>[0];
  trainingDays?: readonly PlanTrainingDay[] | undefined;
};

export function PlanDayChips({
  plan,
  selectedDay,
  todayIndex,
  onSelect,
}: {
  plan: PlanForChips;
  selectedDay: number;
  todayIndex: number | null;
  onSelect: (dayIndex: number) => void;
}) {
  return (
    <View className="flex-row justify-between px-4 pb-2">
      {DAY_LABELS.map((label, i) => {
        const isSelected = selectedDay === i;
        const isToday = todayIndex === i;
        const hasMeals = plan.days.some((d) => d.dayOfWeek === i && d.meals.length > 0);
        const tailorState = tailoringDayState(plan.tailoring, i);
        const tailorLabel = tailoringDayLabel(tailorState);
        const marked =
          tailorState === 'tailored' || tailorState === 'tailoring' || tailorState === 'waiting';
        const training = plan.trainingDays?.find((d) => d.dayOfWeek === i);
        return (
          <Pressable
            key={label}
            testID={`plan-day-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`${
              training ? trainingChipA11y(training.dayName, training.kind) : label
            }${isToday ? ', today' : ''}${tailorLabel ? `, ${tailorLabel}` : ''}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(i)}
            className={cn(
              'h-14 w-11 items-center justify-center gap-0.5 rounded-xl',
              isSelected ? 'bg-primary' : isToday ? 'bg-accent' : 'bg-gray-50',
            )}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-[12px] font-semibold uppercase',
                isSelected ? 'text-primary-foreground' : 'text-gray-600',
              )}
            >
              {label}
            </Text>
            {/* Fixed-height slot: the dot, the training glyph and the
                tailoring marks swap without moving the chip's label. */}
            <View className="h-3 items-center justify-center">
              {marked ? (
                <TailoringDayMark state={tailorState} selected={isSelected} />
              ) : training ? (
                <Ionicons
                  testID={`plan-day-${i}-training`}
                  name={trainingGlyph(training.kind)}
                  size={10}
                  color={isSelected ? colors.primaryForeground : colors.primary}
                />
              ) : (
                <View
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    !hasMeals ? 'bg-transparent' : isSelected ? 'bg-white/70' : 'bg-primary',
                  )}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
