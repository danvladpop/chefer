import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { chunk, cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { SegmentedControl } from './segmented-control';
import { Text } from './text';

// PAT-10 — Time picker (technical-plan.md §2.10): JS-only (no native date
// picker module), OTA-safe. Quick picks for the common cases, then an hour
// grid (6 columns, 44pt cells) and a minute SegmentedControl — two taps
// reach any quarter hour inside the default window. 12-hour locales get
// AM/PM headers on the grid; the hour cycle comes from the device locale
// unless the caller overrides it.

export interface TimeOfDay {
  /** 0–23. */
  hour: number;
  /** 0 | 15 | 30 | 45. */
  minute: number;
}

export interface TimePickerProps {
  value: TimeOfDay;
  onChange: (value: TimeOfDay) => void;
  /** Overrides the device locale's hour cycle (`Intl…hourCycle`). */
  use24h?: boolean;
  testID: string;
}

const QUICK_PICKS: readonly TimeOfDay[] = [
  { hour: 7, minute: 0 },
  { hour: 12, minute: 30 },
  { hour: 18, minute: 0 },
  { hour: 19, minute: 30 },
];

const MINUTE_OPTIONS = [0, 15, 30, 45] as const;
const GRID_COLUMNS = 6;
/** Default hour window (5 am–11 pm). 23 is the day's last hour, so there's
 * never anything for a "Later" toggle to reveal — only "Earlier" (0–4 am)
 * ever does anything; "Later" still renders, disabled, per PAT-10's spec of
 * a symmetric pair of toggles. */
const WINDOW_START = 5;
const WINDOW_END = 23;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** True for a 24-hour locale (`h23`/`h24` hourCycle). Defaults to 12-hour if
 * `Intl` can't resolve one (some hermes/test environments). */
export function resolveUse24h(): boolean {
  try {
    const cycle = Intl.DateTimeFormat().resolvedOptions().hourCycle;
    return cycle === 'h23' || cycle === 'h24';
  } catch {
    return false;
  }
}

/** `19:00` (24h) or `7:00 PM` (12h). */
function formatClock(hour: number, minute: number, use24h: boolean): string {
  if (use24h) {
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelveHour)}:${pad2(minute)} ${period}`;
}

/** The short label painted on an hour cell: `05` (24h) or `5` (12h; the AM/PM
 * header next to it disambiguates). */
function hourCellText(hour: number, use24h: boolean): string {
  if (use24h) {
    return pad2(hour);
  }
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return String(twelveHour);
}

interface HourCellProps {
  selected: boolean;
  label: string;
  a11yLabel: string;
  testID: string;
  onPress: () => void;
}

function HourCell({ selected, label, a11yLabel, testID, onPress }: HourCellProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-lg',
        selected ? 'bg-primary' : 'bg-muted',
      )}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          selected ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TimePicker({ value, onChange, use24h, testID }: TimePickerProps) {
  const [showEarlier, setShowEarlier] = useState(false);
  const resolved24h = use24h ?? resolveUse24h();

  const hours = useMemo(() => {
    const start = showEarlier ? 0 : WINDOW_START;
    const list: number[] = [];
    for (let h = start; h <= WINDOW_END; h += 1) {
      list.push(h);
    }
    return list;
  }, [showEarlier]);

  const setHour = (hour: number) => {
    haptics.selection();
    onChange({ hour, minute: value.minute });
  };

  const renderGrid = (hoursToRender: number[], keyPrefix: string) =>
    chunk(hoursToRender, GRID_COLUMNS).map((row, i) => (
      <View key={`${keyPrefix}-${String(i)}`} className="flex-row gap-2">
        {row.map((hour) => (
          <HourCell
            key={hour}
            selected={hour === value.hour}
            label={hourCellText(hour, resolved24h)}
            a11yLabel={formatClock(hour, value.minute, resolved24h)}
            testID={`${testID}-hour-${String(hour)}`}
            onPress={() => setHour(hour)}
          />
        ))}
      </View>
    ));

  return (
    <View testID={testID} className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        {QUICK_PICKS.map((pick) => {
          const selected = pick.hour === value.hour && pick.minute === value.minute;
          const label = formatClock(pick.hour, pick.minute, resolved24h);
          return (
            <Pressable
              key={label}
              testID={`${testID}-quick-${String(pick.hour)}-${String(pick.minute)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.selection();
                onChange(pick);
              }}
              className={cn(
                'min-h-11 items-center justify-center rounded-full border px-4',
                selected ? 'border-primary bg-primary' : 'border-border bg-background',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-medium',
                  selected ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-2">
        <Pressable
          testID={`${testID}-earlier`}
          accessibilityRole="button"
          accessibilityState={{ selected: showEarlier }}
          onPress={() => {
            haptics.selection();
            setShowEarlier((v) => !v);
          }}
          className="min-h-11 items-center justify-center rounded-full border border-border bg-background px-3"
        >
          <Text variant="muted" className="text-xs font-medium">
            {showEarlier ? 'Hide earlier hours' : 'Earlier'}
          </Text>
        </Pressable>
        {/* Always disabled: WINDOW_END is the day's last hour, so there is
          never a later one to reveal — see the constant's comment. */}
        <Pressable
          testID={`${testID}-later`}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          className="min-h-11 items-center justify-center rounded-full border border-border bg-background px-3 opacity-40"
        >
          <Text variant="muted" className="text-xs font-medium">
            Later
          </Text>
        </Pressable>
      </View>

      {resolved24h ? (
        <View className="gap-2">{renderGrid(hours, 'row')}</View>
      ) : (
        <View className="gap-3">
          <View className="gap-2">
            <Text variant="label">AM</Text>
            {renderGrid(
              hours.filter((h) => h < 12),
              'am',
            )}
          </View>
          <View className="gap-2">
            <Text variant="label">PM</Text>
            {renderGrid(
              hours.filter((h) => h >= 12),
              'pm',
            )}
          </View>
        </View>
      )}

      <SegmentedControl
        testID={`${testID}-minutes`}
        accessibilityLabel="Minutes"
        value={String(value.minute)}
        onChange={(next) => onChange({ hour: value.hour, minute: Number(next) })}
        options={MINUTE_OPTIONS.map((m) => ({
          value: String(m),
          label: `:${pad2(m)}`,
          testID: `${testID}-minute-${String(m)}`,
        }))}
      />
    </View>
  );
}
