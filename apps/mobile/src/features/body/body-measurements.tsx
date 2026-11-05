import { useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import {
  BODY_MEASURE_FIELDS,
  BODY_MEASURE_LABELS,
  BODY_MEASURES,
  type BodyMeasure,
  type BodyMeasurementDto,
} from '@chefer/types';
import {
  Input,
  LineChart,
  NumericReturnBar,
  PressableScale,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  formatDate,
  formatMeasure,
  localDateStr,
  measureChangeText,
  measuredMeasures,
  measureInUnit,
  MEASUREMENTS_COPY,
  measureSeries,
  measureUnit,
  parseMeasurementForm,
  userFacingErrorMessage,
  type UnitSystem,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';

// ─── Body measurements (market review 2026-10, lane D3) ──────────────────────
// Free for everyone: waist, hips, chest, upper arm, thigh and body fat, one
// entry per day (saving again today fills in or corrects today's entry).
// One chart at a time, picked with the chips; the change is a direction,
// never a verdict. Lengths are typed and shown in the user's units, stored
// in cm. Same copy and parsing as web (@chefer/utils body-measurements.ts).

const DAY_MS = 86_400_000;
const BAR_ID = 'body-measurements-numeric-bar';

function shortDay(day: string): string {
  return formatDate(new Date(`${day}T00:00:00`), 'short');
}

export function BodyMeasurements() {
  const colors = useThemeColors();
  const system = useUnitSystem();
  const { data: entries = [] } = trpc.tracker.bodyMeasurements.useQuery(
    { days: 365 },
    { staleTime: 60_000 },
  );
  const [formOpen, setFormOpen] = useState(false);
  const [picked, setPicked] = useState<BodyMeasure | null>(null);
  const measured = measuredMeasures(entries);
  const active = picked && measured.includes(picked) ? picked : (measured[0] ?? null);
  const series = active ? measureSeries(entries, active) : [];
  const change = active ? measureChangeText(series, active, system) : null;
  const points = active
    ? series.map((p) => ({
        x: new Date(`${p.measuredOn}T00:00:00Z`).getTime() / DAY_MS,
        y: measureInUnit(active, p.value, system),
      }))
    : [];
  const first = series.at(0);
  const last = series.at(-1);

  return (
    <View testID="progress-measurements" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
          {MEASUREMENTS_COPY.intro}
        </Text>
        <PressableScale
          testID="measurements-add"
          accessibilityRole="button"
          accessibilityLabel={formOpen ? 'Close measurements' : MEASUREMENTS_COPY.add}
          onPress={() => setFormOpen((o) => !o)}
          className="min-h-11 flex-row items-center gap-1 rounded-control bg-brand-tint px-3"
        >
          <Icon name={formOpen ? 'close' : 'add'} color={colors.brand} size={18} />
          <Text className="text-subhead font-semibold text-brand">
            {formOpen ? 'Close' : 'Add'}
          </Text>
        </PressableScale>
      </View>

      {formOpen ? <MeasurementForm system={system} onSaved={() => setFormOpen(false)} /> : null}

      {active ? (
        <>
          <View accessibilityRole="tablist" className="flex-row flex-wrap gap-2">
            {measured.map((m) => (
              <Pressable
                key={m}
                testID={`measure-chip-${m}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: m === active }}
                onPress={() => setPicked(m)}
                className={cn(
                  'min-h-11 justify-center rounded-full border px-4',
                  m === active ? 'border-brand bg-brand' : 'border-separator bg-surface',
                )}
              >
                <Text
                  className={cn(
                    'text-subhead font-medium',
                    m === active ? 'text-brand-on' : 'text-label',
                  )}
                >
                  {BODY_MEASURE_LABELS[m]}
                </Text>
              </Pressable>
            ))}
          </View>
          {change ? (
            <Text testID="measure-change" className="text-subhead text-label-secondary">
              {change}
            </Text>
          ) : null}
          {points.length > 1 && first && last ? (
            <LineChart
              testID="measure-chart"
              accessibilityLabel={`${BODY_MEASURE_LABELS[active]} from ${shortDay(first.measuredOn)} to ${shortDay(last.measuredOn)}, now ${formatMeasure(active, last.value, system)}`}
              data={points}
              xLabels={[
                { x: points[0]?.x ?? 0, label: shortDay(first.measuredOn) },
                { x: points.at(-1)?.x ?? 0, label: shortDay(last.measuredOn) },
              ]}
              color={colors.brand}
              niceTicks
              height={140}
            />
          ) : (
            <Text testID="measure-one-entry" className="text-subhead text-label-secondary">
              {MEASUREMENTS_COPY.oneEntry}
            </Text>
          )}
        </>
      ) : (
        <Text testID="measurements-empty" className="text-subhead text-label-secondary">
          {MEASUREMENTS_COPY.empty}
        </Text>
      )}

      <MeasurementEntries entries={entries} system={system} />
    </View>
  );
}

function MeasurementForm({ system, onSaved }: { system: UnitSystem; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const [texts, setTexts] = useState<Partial<Record<BodyMeasure, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<BodyMeasure, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const chain = useFieldChain(BODY_MEASURES.length);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // Measurements are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  const log = trpc.tracker.logBodyMeasurement.useMutation({
    onSuccess: (_entry, variables) => {
      track('body_measurement_logged', {
        measures: BODY_MEASURES.filter((m) => variables[BODY_MEASURE_FIELDS[m]] !== undefined),
        units: system === 'IMPERIAL' ? 'imperial' : 'metric',
      });
      setTexts({});
      void utils.tracker.bodyMeasurements.invalidate();
      onSaved();
    },
    onError: (err) => setFormError(userFacingErrorMessage(err)),
  });

  const save = () => {
    const parsed = parseMeasurementForm(texts, system);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(parsed.formError ?? null);
      return;
    }
    Keyboard.dismiss();
    setErrors({});
    setFormError(null);
    setDeclined(false);
    requestHealthConsent(() => log.mutate({ date: localDateStr(), ...parsed.values }), {
      onDeclined: () => setDeclined(true),
    });
  };

  return (
    <View testID="measurement-form" className="gap-3">
      <View className="flex-row flex-wrap gap-3">
        {BODY_MEASURES.map((m, i) => {
          const unit = measureUnit(m, system);
          const error = errors[m];
          return (
            <View key={m} className="min-w-0 basis-[46%] grow gap-1">
              <Text className="text-caption text-label-secondary">
                {`${BODY_MEASURE_LABELS[m]} (${unit})`}
              </Text>
              <Input
                testID={`measure-input-${m}`}
                accessibilityLabel={`${BODY_MEASURE_LABELS[m]} in ${unit === '%' ? 'percent' : unit === 'in' ? 'inches' : 'centimetres'}`}
                aria-invalid={error !== undefined}
                {...(error && { accessibilityHint: error })}
                keyboardType="decimal-pad"
                inputAccessoryViewID={Platform.OS === 'ios' ? BAR_ID : undefined}
                placeholder={unit}
                value={texts[m] ?? ''}
                onChangeText={(text) => {
                  setTexts((t) => ({ ...t, [m]: text }));
                  if (error) setErrors(({ [m]: _cleared, ...rest }) => rest);
                }}
                {...chain.bind(i, { onFocus: scrollFieldIntoView })}
              />
              {error ? (
                <Text
                  testID={`measure-error-${m}`}
                  accessibilityRole="alert"
                  className="text-caption text-attention"
                >
                  {error}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <NumericReturnBar
        nativeID={BAR_ID}
        testID="measurements-numeric-bar"
        label={chain.isLastFocused ? 'Done' : 'Next'}
        onPress={() => chain.focusNext()}
      />
      {formError ? (
        <Text
          testID="measurement-form-error"
          accessibilityRole="alert"
          className="text-subhead text-attention"
        >
          {formError}
        </Text>
      ) : null}
      <PressableScale
        testID="measurement-save"
        accessibilityRole="button"
        disabled={log.isPending}
        onPress={save}
        className="min-h-11 items-center justify-center rounded-control bg-brand px-4"
      >
        <Text className="text-body font-semibold text-brand-on">
          {log.isPending ? MEASUREMENTS_COPY.saving : MEASUREMENTS_COPY.save}
        </Text>
      </PressableScale>
      {declined ? (
        <HealthDeclinedNotice testID="measurements-declined" message={MEASUREMENTS_COPY.declined} />
      ) : null}
      {healthConsentSheet}
    </View>
  );
}

function MeasurementEntries({
  entries,
  system,
}: {
  entries: readonly BodyMeasurementDto[];
  system: UnitSystem;
}) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const remove = trpc.tracker.deleteBodyMeasurement.useMutation({
    onSuccess: () => void utils.tracker.bodyMeasurements.invalidate(),
  });
  if (entries.length === 0) return null;
  const newestFirst = [...entries].reverse().slice(0, 5);

  return (
    <View className="gap-1 border-t border-separator pt-2">
      {remove.isError ? (
        <Text accessibilityRole="alert" className="text-caption text-attention">
          {MEASUREMENTS_COPY.deleteError}
        </Text>
      ) : null}
      {newestFirst.map((entry) => {
        const day = shortDay(entry.measuredOn);
        const values = BODY_MEASURES.flatMap((m) => {
          const v = entry[BODY_MEASURE_FIELDS[m]];
          return v === null ? [] : [`${BODY_MEASURE_LABELS[m]} ${formatMeasure(m, v, system)}`];
        });
        return (
          <View
            key={entry.id}
            testID={`measurement-entry-${entry.measuredOn}`}
            className="flex-row items-center gap-3"
          >
            <Text className="w-14 text-subhead text-label-secondary">{day}</Text>
            <Text className="min-w-0 flex-1 text-subhead text-label">{values.join(' · ')}</Text>
            <Pressable
              testID={`measurement-delete-${entry.measuredOn}`}
              accessibilityRole="button"
              accessibilityLabel={MEASUREMENTS_COPY.deleteLabel(day)}
              disabled={remove.isPending}
              onPress={() => remove.mutate({ id: entry.id })}
              className="h-11 w-11 items-center justify-center"
            >
              <Icon name="trash" color={colors.labelTertiary} size={18} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
