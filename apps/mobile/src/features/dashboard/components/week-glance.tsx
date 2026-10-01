import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeekGlanceDay } from '@chefer/types';
import { colors, Text } from '@chefer/ui-mobile';
import { cn, trainingGlyph, weekdayLongName, weekdayShortName } from '@chefer/utils';

// T-06.5 — Today's `Your week` glance for people who train: seven equal-width
// columns (weekday, day-of-month, meal dots, a training glyph). R-21: the
// column used to show the bare meal COUNT under the weekday, which read like a
// broken date; it now shows the date (like the Plan strip) and the meals as a
// row of small dots, with the count spoken in the accessibility label. It replaces the horizontally
// scrolling day strip, which clipped Sunday. Never a ScrollView: `flex-1`
// columns always fit 320pt, and text is capped at 1.2x so today's column
// stays visible at the largest text sizes. Done = filled glyph, planned =
// outline; the state is also in the accessibility label, never in colour
// alone and never red.

/** Font-scale cap so seven columns keep fitting at large text sizes. */
const MAX_FONT_SCALE = 1.2;

/** Most meal dots drawn per column — keeps seven columns fitting at 320pt. */
const MAX_MEAL_DOTS = 4;

/** `Wednesday: 3 meals, training day, done` — one column's accessibility label. */
export function weekGlanceA11y(day: WeekGlanceDay): string {
  const meals = `${day.meals} meal${day.meals === 1 ? '' : 's'}`;
  const training = day.training
    ? `, training day${day.training.status === 'done' ? ', done' : ''}`
    : '';
  return `${weekdayLongName(day.dayOfWeek)}: ${meals}${training}`;
}

function todayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** Day-of-month of the Monday-first weekday `dayOfWeek` in the week containing `now`. */
export function dayOfMonthFor(dayOfWeek: number, todayIdx: number, now: Date): number {
  const date = new Date(now);
  date.setDate(now.getDate() - todayIdx + dayOfWeek);
  return date.getDate();
}

export function WeekGlance({
  days,
  selectedDayIdx = null,
  onSelectDay,
  todayIdx = todayIndex(),
  now = new Date(),
}: {
  days: readonly WeekGlanceDay[];
  selectedDayIdx?: number | null;
  onSelectDay?: (dayOfWeek: number) => void;
  todayIdx?: number;
  /** The instant "today" is read from (tests pin it); defaults to the device clock. */
  now?: Date;
}) {
  return (
    <View testID="week-glance">
      <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Your week
      </Text>
      <View
        testID="week-glance-list"
        accessibilityRole="list"
        accessibilityLabel="Your week"
        className="flex-row gap-1"
      >
        {days.map((day) => {
          const isToday = day.dayOfWeek === todayIdx;
          const isSelected = selectedDayIdx === day.dayOfWeek;
          const training = day.training;
          const done = training?.status === 'done';
          const inkClass = isToday ? 'text-primary-foreground' : 'text-gray-700';
          const glyphColor = isToday ? '#ffffff' : colors.primary;
          const dots = Math.min(Math.max(day.meals, 0), MAX_MEAL_DOTS);
          return (
            <Pressable
              key={day.dayOfWeek}
              testID={`day-chip-${day.dayOfWeek}`}
              accessibilityRole="button"
              accessibilityLabel={weekGlanceA11y(day)}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDay?.(day.dayOfWeek)}
              className={cn(
                'min-h-11 min-w-0 flex-1 items-center gap-1 rounded-xl px-0.5 py-3',
                isToday ? 'bg-primary' : isSelected ? 'bg-accent' : 'bg-gray-50',
              )}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                className={cn(
                  'text-xs font-semibold uppercase',
                  isToday ? 'text-primary-foreground' : 'text-gray-600',
                )}
              >
                {weekdayShortName(day.dayOfWeek)}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                className={cn('text-sm font-bold', inkClass)}
              >
                {dayOfMonthFor(day.dayOfWeek, todayIdx, now)}
              </Text>
              {/* Decorative: the meal count is in the column's spoken label. */}
              <View
                testID={`week-glance-meals-${day.dayOfWeek}`}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="h-1.5 flex-row items-center justify-center gap-0.5"
              >
                {Array.from({ length: dots }, (_, i) => (
                  <View
                    key={i}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isToday ? 'bg-primary-foreground' : 'bg-gray-400',
                    )}
                  />
                ))}
              </View>
              <View className="h-5 items-center justify-center">
                {training ? (
                  <Ionicons
                    testID={`week-glance-glyph-${day.dayOfWeek}-${done ? 'done' : 'planned'}`}
                    name={
                      done
                        ? (trainingGlyph(training.kind).replace('-outline', '') as
                            | 'barbell'
                            | 'walk')
                        : trainingGlyph(training.kind)
                    }
                    size={16}
                    color={glyphColor}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
