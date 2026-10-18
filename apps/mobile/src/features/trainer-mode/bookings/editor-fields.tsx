import { useState } from 'react';
import { View } from 'react-native';
import { BOOKING_COPY, BOOKING_DURATION_CHIPS, BOOKING_DURATION_LIMITS } from '@chefer/types';
import {
  Chip,
  DONE_FIELD_PROPS,
  haptics,
  IconButton,
  Input,
  PressableScale,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  addDaysLocal,
  cn,
  formatDayWithWeekday,
  isChipDuration,
  isValidBookingDuration,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { clockOf } from './booking-model';

// The booking editor's own fields (§6.3). The app's shared TimePicker snaps
// to quarter hours; bookings need 5-minute steps, so Start is an hour grid
// (the TimePicker's 6-column, 44 pt layout) plus twelve 5-minute chips.

/** ‹ Tue 21 Oct › — a date stepper (no native date picker module: OTA-safe). */
export function DateStepperField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  /** Days per press (7 for a weekly repeat's end). */
  step?: number;
  onChange: (date: string) => void;
  testID: string;
}) {
  const colors = useThemeColors();
  const prev = addDaysLocal(value, -step);
  const next = addDaysLocal(value, step);
  return (
    <View className="gap-1">
      <Text className="text-subhead font-semibold text-label-secondary">{label}</Text>
      <View className="min-h-12 flex-row items-center rounded-control bg-surface-sunken px-1">
        <IconButton
          testID={`${testID}-prev`}
          accessibilityLabel={BOOKING_COPY.editor.earlier(label)}
          disabled={prev < min}
          icon={
            <Icon name="chevronBack" color={prev < min ? colors.labelTertiary : colors.brand} />
          }
          onPress={() => onChange(prev)}
        />
        <Text
          testID={`${testID}-value`}
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          className="min-w-0 flex-1 text-center text-body font-semibold text-label"
        >
          {formatDayWithWeekday(value)}
        </Text>
        <IconButton
          testID={`${testID}-next`}
          accessibilityLabel={BOOKING_COPY.editor.later(label)}
          disabled={next > max}
          icon={
            <Icon name="chevronRight" color={next > max ? colors.labelTertiary : colors.brand} />
          }
          onPress={() => onChange(next)}
        />
      </View>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, '0');

function GridCell({
  label,
  a11y,
  selected,
  onPress,
  testID,
}: {
  label: string;
  a11y: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={cn(
        'h-11 min-w-0 flex-1 items-center justify-center rounded-inner',
        selected ? 'bg-brand' : 'bg-surface-sunken',
      )}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        className={cn('text-callout font-semibold', selected ? 'text-brand-on' : 'text-label')}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/** Start: the time as a row that opens an hour grid + 5-minute chips (24 h, like the schedule). */
export function StartTimeField({
  value,
  onChange,
  testID,
}: {
  value: string;
  onChange: (time: string) => void;
  testID: string;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number) as [number, number];
  const rows = (items: number[], per: number) =>
    Array.from({ length: Math.ceil(items.length / per) }, (_, i) =>
      items.slice(i * per, i * per + per),
    );
  return (
    <View className="gap-2">
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${BOOKING_COPY.editor.start}: ${value}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        className="min-h-12 flex-row items-center justify-between rounded-control bg-surface-sunken px-4"
      >
        <Text className="text-subhead font-semibold text-label-secondary">
          {BOOKING_COPY.editor.start}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text testID={`${testID}-value`} className="text-body font-semibold text-label">
            {value}
          </Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} color={colors.labelTertiary} size={18} />
        </View>
      </PressableScale>
      {open ? (
        <View testID={`${testID}-picker`} className="gap-3">
          <View className="gap-1">
            {rows(HOURS, 6).map((row) => (
              <View key={row[0]} className="flex-row gap-1">
                {row.map((hour) => (
                  <GridCell
                    key={hour}
                    testID={`${testID}-hour-${hour}`}
                    label={pad(hour)}
                    a11y={clockOf(hour * 60 + m)}
                    selected={hour === h}
                    onPress={() => onChange(clockOf(hour * 60 + m))}
                  />
                ))}
              </View>
            ))}
          </View>
          <View className="gap-1">
            {rows(MINUTES, 6).map((row) => (
              <View key={row[0]} className="flex-row gap-1">
                {row.map((minute) => (
                  <GridCell
                    key={minute}
                    testID={`${testID}-minute-${minute}`}
                    label={`:${pad(minute)}`}
                    a11y={clockOf(h * 60 + minute)}
                    selected={minute === m}
                    onPress={() => onChange(clockOf(h * 60 + minute))}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const { min: MIN, max: MAX } = BOOKING_DURATION_LIMITS;

/** Duration: 30 / 45 / 60 / 90 chips, or Custom (15–240 min) with the number pad. */
export function DurationField({
  value,
  onChange,
  testID,
}: {
  value: number;
  onChange: (min: number) => void;
  testID: string;
}) {
  const chip = isChipDuration(value);
  const [custom, setCustom] = useState(!chip);
  const [text, setText] = useState(String(value));
  const invalid = custom && !isValidBookingDuration(Number(text));
  return (
    <View className="gap-2">
      <Text className="text-subhead font-semibold text-label-secondary">
        {BOOKING_COPY.editor.duration}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {BOOKING_DURATION_CHIPS.map((min) => (
          <Chip
            key={min}
            testID={`${testID}-${min}`}
            label={BOOKING_COPY.editor.minutes(min)}
            selected={!custom && value === min}
            onPress={() => {
              setCustom(false);
              setText(String(min));
              onChange(min);
            }}
          />
        ))}
        <Chip
          testID={`${testID}-custom`}
          label={BOOKING_COPY.editor.custom}
          selected={custom}
          onPress={() => setCustom(true)}
        />
      </View>
      {custom ? (
        <View className="flex-row items-center gap-2">
          <Input
            testID={`${testID}-input`}
            accessibilityLabel={BOOKING_COPY.editor.customLabel(MIN, MAX)}
            aria-invalid={invalid}
            keyboardType="number-pad"
            {...DONE_FIELD_PROPS}
            value={text}
            selectTextOnFocus
            onChangeText={(next) => {
              const digits = next.replace(/[^0-9]/g, '').slice(0, 3);
              setText(digits);
              if (isValidBookingDuration(Number(digits))) onChange(Number(digits));
            }}
            onBlur={() => {
              if (!isValidBookingDuration(Number(text))) setText(String(value));
            }}
            className="w-24 text-center"
          />
          <Text className="text-subhead text-label-secondary">
            {BOOKING_COPY.editor.customHint(MIN, MAX)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
