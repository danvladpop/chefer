import { useEffect, useId, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import { DONE_FIELD_PROPS, Input, NumericReturnBar, Text, useThemeColors } from '@chefer/ui-mobile';
import { addDaysLocal, cn, weekdayDateLabel } from '@chefer/utils';
import { getTranslator, useT } from '../../../lib/i18n';

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

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/**
 * "Thu 24 Sep" in the UI language, from a local date, through the fixed
 * `common` tables (`weekdayDateLabel` in @chefer/utils is English only).
 */
export function weekdayDateLabelT(
  localDate: string,
  t: Translator['t'] = getTranslator().t,
): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_KEYS[(date.getUTCDay() + 6) % 7] ?? 'mon';
  const month = MONTH_KEYS[date.getUTCMonth()] ?? 'jan';
  return `${t(`common.weekdaysShort.${weekday}`)} ${date.getUTCDate()} ${t(`common.monthsShort.${month}`)}`;
}

export function whenDateLabel(
  date: string,
  today: string,
  t: Translator['t'] = getTranslator().t,
): string {
  const label = weekdayDateLabelT(date, t);
  if (date === today) return t('gym.session.edit.today', { date: label });
  if (date === addDaysLocal(today, -1)) return t('gym.session.edit.yesterday', { date: label });
  return label;
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
  // Enabled / disabled chevrons — Ionicons takes a colour, not a class.
  const colors = useThemeColors();
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
      <Ionicons name={icon} size={22} color={disabled ? colors.labelTertiary : colors.label} />
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
  const { t } = useT();
  return (
    <View className="gap-1">
      <Text variant="label">{t('gym.session.edit.date')}</Text>
      <View className="min-h-12 flex-row items-center rounded-xl bg-muted px-1">
        <StepButton
          testID={`${testID}-date-prev`}
          label={t('gym.session.edit.prevDay')}
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
          {whenDateLabel(localDate, today, t)}
        </Text>
        <StepButton
          testID={`${testID}-date-next`}
          label={t('gym.session.edit.nextDay')}
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
  const { t } = useT();
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
          {t('gym.summary.duration')}
        </Text>
        <View className="flex-row items-center gap-2">
          <Input
            testID={`${testID}-duration`}
            accessibilityLabel={t('gym.session.edit.durationA11y')}
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
          <Text variant="muted">{t('gym.summary.unitMin')}</Text>
        </View>
        {/* UX-GYM-34: the number pad has no Return key on iOS. */}
        <NumericReturnBar
          nativeID={barId}
          testID={`${testID}-numeric-bar`}
          label={t('common.actions.done')}
          onPress={() => Keyboard.dismiss()}
        />
      </View>
    </View>
  );
}
