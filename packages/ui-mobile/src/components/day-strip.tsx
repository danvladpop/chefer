import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { Text } from './text';

// Seven day buttons across the top of Meals (10 Oct redesign, ref-1/ref-3):
// short weekday over the date, the selected day filled brand, today marked
// with a dot (so "today" is not colour-only). Each button is ≥44pt and says
// its full date to screen readers.

export interface DayStripDay {
  /** Stable key, e.g. the ISO date or the day-of-week index. */
  key: string;
  /** Short weekday, e.g. "Mon". */
  weekday: string;
  /** Day of the month, e.g. 12. */
  date: number;
  /** Full spoken label, e.g. "Monday 12 October". */
  accessibilityLabel: string;
  isToday?: boolean;
  disabled?: boolean;
}

export interface DayStripProps {
  days: readonly DayStripDay[];
  selectedKey: string;
  onSelect: (key: string) => void;
  className?: string;
  testID?: string;
}

export function DayStrip({ days, selectedKey, onSelect, className, testID }: DayStripProps) {
  return (
    <View testID={testID} accessibilityRole="tablist" className={cn('flex-row gap-1.5', className)}>
      {days.map((day) => {
        const selected = day.key === selectedKey;
        return (
          <PressableScale
            key={day.key}
            testID={testID ? `${testID}-${day.key}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={`${day.accessibilityLabel}${day.isToday ? ', today' : ''}`}
            accessibilityState={{ selected, disabled: day.disabled }}
            disabled={day.disabled}
            onPress={() => {
              haptics.selection();
              onSelect(day.key);
            }}
            className={cn(
              'min-h-16 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-control',
              selected ? 'bg-brand' : 'border border-separator bg-surface',
              day.disabled && 'opacity-40',
            )}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              className={cn(
                'text-xs font-semibold uppercase',
                selected ? 'text-brand-on' : 'text-label-tertiary',
              )}
            >
              {day.weekday}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              className={cn('text-headline font-bold', selected ? 'text-brand-on' : 'text-label')}
            >
              {day.date}
            </Text>
            <View
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                day.isToday ? (selected ? 'bg-brand-on' : 'bg-brand') : 'bg-transparent',
              )}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}
