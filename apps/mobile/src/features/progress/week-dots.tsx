import { View } from 'react-native';
import type { FlameDayState } from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn, PROGRESS_COPY, PROGRESS_WEEKDAY_LETTERS, PROGRESS_WEEKDAYS } from '@chefer/utils';
import { Icon } from '../../components/icon';

// Monday to Sunday, one dot per day (mockups 01 and 05): done (a tick), a past
// quiet day (a moon: rest, never a gap), today still open (a ring) and later
// this week (empty). Colour is never the only signal: the glyph differs and
// each dot says its state to a screen reader. Not a control, so the dots are
// plain views.

const STATE_LABEL: Record<FlameDayState, string> = {
  active: PROGRESS_COPY.flameDayActive,
  rest: PROGRESS_COPY.flameDayRest,
  today: PROGRESS_COPY.flameDayToday,
  future: PROGRESS_COPY.flameDayLater,
};

export interface WeekDotsProps {
  days: readonly FlameDayState[];
  /** `letters` (M T W …) on Today, `names` (Mon Tue …) in the Flame sheet. */
  labels?: 'letters' | 'names';
  testID?: string;
}

function Dot({ state }: { state: FlameDayState }) {
  const colors = useThemeColors();
  return (
    <View
      className={cn(
        'h-8 w-8 items-center justify-center rounded-full',
        state === 'active' && 'bg-attention',
        state === 'rest' && 'bg-surface-sunken',
        state === 'today' && 'border-2 border-brand bg-surface',
        state === 'future' && 'bg-surface-sunken',
      )}
    >
      {state === 'active' ? <Icon name="checkmark" size={18} color={colors.onBrand} /> : null}
      {state === 'rest' ? <Text className="text-callout text-info">☾</Text> : null}
      {state === 'today' ? <View className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
    </View>
  );
}

export function WeekDots({ days, labels = 'letters', testID = 'week-dots' }: WeekDotsProps) {
  return (
    <View testID={testID} className="flex-row items-center justify-between gap-1">
      {days.map((state, i) => {
        const name = PROGRESS_WEEKDAYS[i] ?? '';
        return (
          <View
            key={name}
            testID={`${testID}-${i}`}
            accessible
            accessibilityLabel={`${name}, ${STATE_LABEL[state]}`}
            className="min-w-0 items-center gap-1"
          >
            <Text
              importantForAccessibility="no"
              maxFontSizeMultiplier={1.3}
              className="text-caption font-semibold text-label-secondary"
            >
              {labels === 'letters' ? PROGRESS_WEEKDAY_LETTERS[i] : name}
            </Text>
            <Dot state={state} />
          </View>
        );
      })}
    </View>
  );
}
