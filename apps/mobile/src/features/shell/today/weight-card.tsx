import { useId, useRef, useState } from 'react';
import { Keyboard, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { router } from 'expo-router';
import {
  NumericReturnBar,
  PressableScale,
  Text,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import { bodyWeightInUnit, bodyWeightUnit, formatBodyWeight, type UnitSystem } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useUnitSystem } from '../../../hooks/use-unit-system';
import { trpc } from '../../../lib/trpc';
import { useWeightLog } from '../../coach/use-weight-log';
import { HealthDeclinedNotice } from '../../privacy/health-notices';
import { ActionButton, BoardCard } from './parts';
import {
  lastWeighInText,
  weighedInToday,
  weightChangeText,
  type WeightEntry,
} from './today-helpers';

// Today's weight (10 Oct redesign, boards Home / HomeDone): until today's
// weigh-in it is a small "Weigh in" form; once today is logged it becomes a
// progress widget — the latest weight, the 30-day change and a sparkline —
// that opens Stats. The save is the shared weigh-in write (use-weight-log):
// the user's kg/lb, the duplicate guard, the health-consent gate and Undo.

const WINDOW_DAYS = 30;
const SPARK_H = 44;
const SPARK_PAD = 4;
const DAY_MS = 86_400_000;

function Sparkline({ entries, system }: { entries: readonly WeightEntry[]; system: UnitSystem }) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  if (entries.length < 2) return null;
  const values = entries.map((e) => bodyWeightInUnit(e.weightKg, system));
  const times = entries.map((e) => new Date(e.recordedAt).getTime() / DAY_MS);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const minX = times[0] ?? 0;
  const maxX = times.at(-1) ?? minX;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 0.1);
  const x = (t: number) => SPARK_PAD + ((t - minX) / spanX) * Math.max(width - SPARK_PAD * 2, 0);
  const y = (v: number) => SPARK_PAD + (1 - (v - minY) / spanY) * (SPARK_H - SPARK_PAD * 2);
  const points = values.map((v, i) => `${x(times[i] ?? minX)},${y(v)}`).join(' ');
  const lastValue = values.at(-1) ?? 0;
  return (
    <View
      testID="today-weight-sparkline"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: SPARK_H }}
      className="min-w-0 flex-1"
    >
      {width > 0 ? (
        <Svg width={width} height={SPARK_H}>
          <Polyline points={points} fill="none" stroke={colors.brand} strokeWidth={2.5} />
          <Circle cx={x(maxX)} cy={y(lastValue)} r={3.5} fill={colors.brand} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * The weigh-in field and Save: the shared write (use-weight-log) in the
 * redesign's look. Used by Today's "Weigh in" card and Stats' "Log weight".
 */
export function WeightField({
  lastEntry,
  testID = 'today-weight',
}: {
  lastEntry: WeightEntry | null;
  testID?: string;
}) {
  const colors = useThemeColors();
  const log = useWeightLog(lastEntry);
  const unit = bodyWeightUnit(log.system);
  const barId = `${testID}-numeric-bar-${useId()}`;
  const inputRef = useRef<TextInput>(null);
  // Keeps the field above the keyboard inside a KeyboardAwareScrollView.
  const scrollFieldIntoView = useScrollFieldIntoView();
  const save = () => {
    if (log.submit()) Keyboard.dismiss();
  };
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <TextInput
          testID={`${testID}-input`}
          ref={inputRef}
          onFocus={() => scrollFieldIntoView(inputRef.current)}
          value={log.value}
          onChangeText={log.onChangeText}
          returnKeyType="done"
          onSubmitEditing={save}
          inputAccessoryViewID={barId}
          keyboardType="decimal-pad"
          placeholder={unit}
          placeholderTextColor={colors.labelTertiary}
          accessibilityLabel={`Today's weight in ${unit === 'lb' ? 'pounds' : 'kilograms'}`}
          {...(log.error && { accessibilityHint: log.error })}
          className="min-h-11 min-w-0 flex-1 rounded-control border border-separator bg-surface px-3 py-2 text-body text-label"
        />
        <ActionButton
          testID={`${testID}-save`}
          label={log.saved ? 'Saved' : 'Save'}
          variant="filled"
          disabled={log.disabled}
          accessibilityLabel="Save weight"
          onPress={save}
          className="px-6"
        />
      </View>
      <NumericReturnBar
        nativeID={barId}
        testID={`${testID}-numeric-bar`}
        label="Save"
        onPress={save}
      />
      {log.error ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          className="text-subhead text-attention"
        >
          {log.error}
        </Text>
      ) : null}
      {log.declined ? (
        <HealthDeclinedNotice
          testID={`${testID}-declined`}
          message="Your weight wasn’t saved, because Chefer doesn’t have permission to store health information."
        />
      ) : null}
      {log.healthConsentSheet}
    </View>
  );
}

function WeighIn({ entries }: { entries: readonly WeightEntry[] }) {
  const colors = useThemeColors();
  const system = useUnitSystem();
  const latest = entries.at(-1);
  const last = lastWeighInText(latest, system);
  return (
    <BoardCard testID="today-weigh-in">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint">
          <Icon name="scale" color={colors.brand} size={18} />
        </View>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-headline font-bold text-label">
            Weigh in
          </Text>
          {last ? (
            <Text testID="today-weigh-in-last" className="text-subhead text-label-secondary">
              {last}
            </Text>
          ) : null}
        </View>
      </View>
      <WeightField lastEntry={latest ?? null} />
    </BoardCard>
  );
}

function WeightWidget({ entries }: { entries: readonly WeightEntry[] }) {
  const colors = useThemeColors();
  const system = useUnitSystem();
  const latest = entries.at(-1);
  if (!latest) return null;
  const change = weightChangeText(entries, system, WINDOW_DAYS);
  const weight = formatBodyWeight(latest.weightKg, system);
  return (
    // MO-01: the whole widget is one press target into Stats.
    <PressableScale
      testID="today-weight-widget"
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={`Weight ${weight}${change ? `, ${change}` : ''}, logged today`}
      accessibilityHint="Opens Stats"
      onPress={() => router.push('/progress')}
      className="gap-2 rounded-card border border-separator bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Icon name="scale" color={colors.brand} size={18} />
          <Text className="text-headline font-bold text-label">Weight</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon name="checkmark" color={colors.positive} size={16} />
          <Text className="text-subhead font-semibold text-positive">Logged today</Text>
        </View>
      </View>
      <View className="flex-row items-end gap-4">
        <View>
          <Text testID="today-weight-latest" className="text-title1 font-bold text-label">
            {weight}
          </Text>
          {change ? (
            <Text testID="today-weight-change" className="text-subhead text-label-secondary">
              {change}
            </Text>
          ) : null}
        </View>
        <Sparkline entries={entries} system={system} />
      </View>
    </PressableScale>
  );
}

/** Today's weight card: "Weigh in" until today is logged, then the progress widget. */
export function TodayWeight() {
  const { data } = trpc.tracker.weightHistory.useQuery(
    { days: WINDOW_DAYS },
    { staleTime: 60_000 },
  );
  if (!data) return null;
  return weighedInToday(data) ? <WeightWidget entries={data} /> : <WeighIn entries={data} />;
}
