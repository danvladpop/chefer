import { useEffect, useId, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DONE_FIELD_PROPS, Input, NumericReturnBar, Text } from '@chefer/ui-mobile';
import { addDaysLocal, cn, weekdayDateLabel } from '@chefer/utils';

// The `When` of a past workout (owner dogfood 2026-09-30): a day and how long
// it took — nothing else. Replaces the day-chip grid + clock-time picker that
// edit mode's `Change ›` used to open, and is shown inline in log mode.
// A ‹ date › stepper, not a calendar: the reachable range is ~two weeks
// (Monday of last week → today), and it needs no native date-picker module.

/** Longest session the field accepts (10 h). */
export const MAX_DURATION_MIN = 600;
/** Enabled / disabled chevrons — Ionicons takes a colour, not a class. */
const ICON_ON = '#374151';
const ICON_OFF = '#d1d5db';

export function whenDateLabel(date: string, today: string): string {
  if (date === today) return `Today · ${weekdayDateLabel(date)}`;
  if (date === addDaysLocal(today, -1)) return `Yesterday · ${weekdayDateLabel(date)}`;
  return weekdayDateLabel(date);
}

function StepButton({
  testID,
  label,
  icon,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: 'chevron-back' | 'chevron-forward';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
    >
      <Ionicons name={icon} size={22} color={disabled ? ICON_OFF : ICON_ON} />
    </Pressable>
  );
}

export interface DateStepperProps {
  localDate: string;
  /** Earliest pickable day (inclusive). */
  minDate: string;
  /** Latest pickable day (inclusive) — today. */
  today: string;
  onChangeDate: (localDate: string) => void;
  testID: string;
}

/** The ‹ date › stepper on its own (also used by the activity quick-log sheet). */
export function DateStepper({ localDate, minDate, today, onChangeDate, testID }: DateStepperProps) {
  return (
    <View className="gap-1">
      <Text variant="label">Date</Text>
      <View className="min-h-12 flex-row items-center rounded-xl bg-muted px-1">
        <StepButton
          testID={`${testID}-date-prev`}
          label="Previous day"
          icon="chevron-back"
          disabled={localDate <= minDate}
          onPress={() => onChangeDate(addDaysLocal(localDate, -1))}
        />
        <Text
          testID={`${testID}-date`}
          accessibilityLiveRegion="polite"
          className="min-w-0 flex-1 text-center text-base font-semibold"
          numberOfLines={1}
        >
          {whenDateLabel(localDate, today)}
        </Text>
        <StepButton
          testID={`${testID}-date-next`}
          label="Next day"
          icon="chevron-forward"
          disabled={localDate >= today}
          onPress={() => onChangeDate(addDaysLocal(localDate, 1))}
        />
      </View>
    </View>
  );
}

export interface SessionWhenFieldsProps {
  localDate: string;
  durationMin: number;
  /** Earliest pickable day (inclusive). */
  minDate: string;
  /** Latest pickable day (inclusive) — today. */
  today: string;
  onChangeDate: (localDate: string) => void;
  onChangeDuration: (durationMin: number) => void;
  testID: string;
  className?: string;
}

export function SessionWhenFields({
  localDate,
  durationMin,
  minDate,
  today,
  onChangeDate,
  onChangeDuration,
  testID,
  className,
}: SessionWhenFieldsProps) {
  const barId = `${testID}-numeric-bar-${useId()}`;
  // The text is local so the field can be cleared while typing; only a valid
  // number reaches the parent.
  const [text, setText] = useState(String(durationMin));
  useEffect(() => {
    setText((current) => (Number(current) === durationMin ? current : String(durationMin)));
  }, [durationMin]);

  const onChangeText = (next: string) => {
    const digits = next.replace(/[^0-9]/g, '').slice(0, 3);
    setText(digits);
    const minutes = Number(digits);
    if (digits !== '' && minutes > 0 && minutes <= MAX_DURATION_MIN) onChangeDuration(minutes);
  };
  const invalid = text === '' || Number(text) <= 0 || Number(text) > MAX_DURATION_MIN;

  return (
    <View className={cn('gap-3', className)}>
      <DateStepper
        localDate={localDate}
        minDate={minDate}
        today={today}
        onChangeDate={onChangeDate}
        testID={testID}
      />
      <View className="gap-1">
        <Text variant="label" nativeID={`${testID}-duration-label`}>
          Duration
        </Text>
        <View className="flex-row items-center gap-2">
          <Input
            testID={`${testID}-duration`}
            accessibilityLabel="Duration in minutes"
            accessibilityLabelledBy={`${testID}-duration-label`}
            aria-invalid={invalid}
            keyboardType="number-pad"
            inputAccessoryViewID={barId}
            {...DONE_FIELD_PROPS}
            value={text}
            onChangeText={onChangeText}
            onBlur={() => {
              if (invalid) setText(String(durationMin));
            }}
            selectTextOnFocus
            className="w-24 text-center"
          />
          <Text variant="muted">min</Text>
        </View>
        {/* UX-GYM-34: the number pad has no Return key on iOS. */}
        <NumericReturnBar
          nativeID={barId}
          testID={`${testID}-numeric-bar`}
          label="Done"
          onPress={() => Keyboard.dismiss()}
        />
      </View>
    </View>
  );
}
