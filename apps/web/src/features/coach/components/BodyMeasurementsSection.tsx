'use client';

import { useState } from 'react';
import { HealthDeclinedNotice } from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Trash2 } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  BODY_MEASURE_FIELDS,
  BODY_MEASURE_LABELS,
  BODY_MEASURES,
  type BodyMeasure,
  type BodyMeasurementDto,
} from '@chefer/types';
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

// ─── Progress → Body measurements (market review 2026-10, lane D3) ───────────
// Free for everyone: waist, hips, chest, upper arm, thigh and body fat, one
// entry per day (saving again today fills in or corrects today's entry). One
// chart at a time, picked with the chips; the change is a direction, never a
// verdict. Lengths are typed and shown in the user's units, stored in cm.

const CHART_COLOR = '#944a00';

/** "2026-10-20" as a local calendar day ("20 Oct"). */
function shortDay(day: string): string {
  return formatDate(new Date(`${day}T00:00:00`), 'short');
}

export function BodyMeasurementsSection({ system }: { system: UnitSystem }) {
  const { data: entries = [] } = trpc.tracker.bodyMeasurements.useQuery(
    { days: 365 },
    { staleTime: 60_000 },
  );
  const measured = measuredMeasures(entries);
  const [picked, setPicked] = useState<BodyMeasure | null>(null);
  const active = picked && measured.includes(picked) ? picked : (measured[0] ?? null);
  const series = active ? measureSeries(entries, active) : [];
  const change = active ? measureChangeText(series, active, system) : null;

  return (
    <section
      id="measurements"
      data-testid="progress-measurements"
      className="mb-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {MEASUREMENTS_COPY.title}
      </h2>
      <p className="mb-4 text-sm text-neutral-500">{MEASUREMENTS_COPY.intro}</p>

      {active ? (
        <>
          <div role="group" aria-label="Measure" className="mb-3 flex flex-wrap gap-2">
            {measured.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === active}
                data-testid={`measure-chip-${m}`}
                onClick={() => setPicked(m)}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-sm font-medium',
                  m === active
                    ? 'border-[#944a00] bg-[#944a00] text-white'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50',
                )}
              >
                {BODY_MEASURE_LABELS[m]}
              </button>
            ))}
          </div>
          {change && (
            <p data-testid="measure-change" className="mb-2 text-sm text-neutral-600">
              {change}
            </p>
          )}
          {series.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart
                data={series.map((p) => ({
                  date: shortDay(p.measuredOn),
                  value: measureInUnit(active, p.value, system),
                }))}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(val) => [
                    `${String(val)} ${measureUnit(active, system)}`,
                    BODY_MEASURE_LABELS[active],
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p data-testid="measure-one-entry" className="mb-2 text-sm text-neutral-500">
              {MEASUREMENTS_COPY.oneEntry}
            </p>
          )}
        </>
      ) : (
        <p data-testid="measurements-empty" className="mb-2 text-sm text-neutral-500">
          {MEASUREMENTS_COPY.empty}
        </p>
      )}

      <MeasurementForm system={system} />
      <MeasurementEntries entries={entries} system={system} />
    </section>
  );
}

function MeasurementForm({ system }: { system: UnitSystem }) {
  const utils = trpc.useUtils();
  const [texts, setTexts] = useState<Partial<Record<BodyMeasure, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<BodyMeasure, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [declined, setDeclined] = useState(false);
  // Measurements are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  const log = trpc.tracker.logBodyMeasurement.useMutation({
    meta: { silent: true },
    onSuccess: (_entry, variables) => {
      capture('body_measurement_logged', {
        measures: BODY_MEASURES.filter((m) => variables[BODY_MEASURE_FIELDS[m]] !== undefined),
        units: system === 'IMPERIAL' ? 'imperial' : 'metric',
      });
      setTexts({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void utils.tracker.bodyMeasurements.invalidate();
    },
    onError: (err) => setFormError(userFacingErrorMessage(err)),
  });

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const parsed = parseMeasurementForm(texts, system);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(parsed.formError ?? null);
      return;
    }
    setErrors({});
    setFormError(null);
    setDeclined(false);
    requestHealthConsent(() => log.mutate({ date: localDateStr(), ...parsed.values }), {
      onDeclined: () => setDeclined(true),
    });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="measurement-form"
      className="mt-4 border-t pt-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-neutral-800">{MEASUREMENTS_COPY.add}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BODY_MEASURES.map((m) => {
          const id = `measure-${m}`;
          const error = errors[m];
          return (
            <div key={m} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={id} className="text-xs text-neutral-600">
                {`${BODY_MEASURE_LABELS[m]} (${measureUnit(m, system)})`}
              </label>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                value={texts[m] ?? ''}
                onChange={(e) => {
                  setTexts((t) => ({ ...t, [m]: e.target.value }));
                  if (error) setErrors(({ [m]: _cleared, ...rest }) => rest);
                }}
                aria-invalid={error != null}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                  'min-h-11 min-w-0 rounded-xl border px-3 text-sm focus:outline-none focus:ring-1',
                  error
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-gray-200 focus:border-[#944a00] focus:ring-[#944a00]',
                )}
              />
              {error && (
                <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {formError && (
        <p role="alert" data-testid="measurement-form-error" className="mt-2 text-xs text-red-600">
          {formError}
        </p>
      )}
      <button
        type="submit"
        data-testid="measurement-save"
        disabled={log.isPending}
        className="mt-3 min-h-11 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
      >
        {log.isPending
          ? MEASUREMENTS_COPY.saving
          : saved
            ? `✓ ${MEASUREMENTS_COPY.saved}`
            : MEASUREMENTS_COPY.save}
      </button>
      {declined && (
        <div className="mt-2">
          <HealthDeclinedNotice
            testId="measurements-declined"
            message={MEASUREMENTS_COPY.declined}
          />
        </div>
      )}
      {healthConsentSheet}
    </form>
  );
}

function MeasurementEntries({
  entries,
  system,
}: {
  entries: readonly BodyMeasurementDto[];
  system: UnitSystem;
}) {
  const utils = trpc.useUtils();
  const remove = trpc.tracker.deleteBodyMeasurement.useMutation({
    onSuccess: () => void utils.tracker.bodyMeasurements.invalidate(),
  });
  if (entries.length === 0) return null;
  const newestFirst = [...entries].reverse();

  return (
    <div className="mt-4 border-t pt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {MEASUREMENTS_COPY.entries}
      </h3>
      {remove.isError && (
        <p role="alert" className="text-xs text-red-600">
          {MEASUREMENTS_COPY.deleteError}
        </p>
      )}
      <ul className="divide-y">
        {newestFirst.slice(0, 10).map((entry) => {
          const day = shortDay(entry.measuredOn);
          const values = BODY_MEASURES.flatMap((m) => {
            const v = entry[BODY_MEASURE_FIELDS[m]];
            return v === null ? [] : [`${BODY_MEASURE_LABELS[m]} ${formatMeasure(m, v, system)}`];
          });
          return (
            <li
              key={entry.id}
              data-testid={`measurement-entry-${entry.measuredOn}`}
              className="flex items-center gap-3 py-2"
            >
              <span className="w-14 shrink-0 text-sm text-neutral-500">{day}</span>
              <span className="min-w-0 flex-1 text-sm text-neutral-800">{values.join(' · ')}</span>
              <button
                type="button"
                aria-label={MEASUREMENTS_COPY.deleteLabel(day)}
                onClick={() => remove.mutate({ id: entry.id })}
                disabled={remove.isPending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
