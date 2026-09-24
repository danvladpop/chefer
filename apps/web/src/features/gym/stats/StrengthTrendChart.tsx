'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ExerciseDto, StatsRange } from '@chefer/types';
import { mergeByDate, type NamedChannel } from './merge-series';
import { withBodyweight } from './relative-strength';

// Stats tab #1 (gym_plan.md §1.3): e1RM trend per lift, PR dots, 3m/1y/all,
// a bodyweight overlay on a second axis and a relative-strength toggle.

const RANGES: { value: StatsRange; label: string }[] = [
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
];

const COLORS = ['#944a00', '#2563eb', '#059669', '#d946ef'];
const MAX_LIFTS = 4;

function colorFor(index: number): string {
  return COLORS[index % COLORS.length] ?? '#944a00';
}

function PrDot(props: {
  cx?: number;
  cy?: number;
  payload?: Record<string, unknown>;
  dataKey?: string;
}) {
  const { cx, cy, payload, dataKey } = props;
  if (cx == null || cy == null || !dataKey) return null;
  const isPr = payload?.[`${dataKey}__pr`] === true;
  if (!isPr) return null;
  return (
    <circle cx={cx} cy={cy} r={4.5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5}>
      <title>Personal record</title>
    </circle>
  );
}

export function StrengthTrendChart({
  library,
  defaultExerciseIds,
}: {
  library: ExerciseDto[];
  defaultExerciseIds: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultExerciseIds);
  const [range, setRange] = useState<StatsRange>('3m');
  const [relative, setRelative] = useState(false);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const addableOptions = library
    .filter((e) => !e.archived && !selectedIds.includes(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const e1rmQueries = trpc.useQueries((t) =>
    selectedIds.map((exerciseId) => t.gym.stats.e1rm({ exerciseId, range })),
  );
  const bodyweightQuery = trpc.gym.stats.bodyweight.useQuery({ range });
  const bodyweight = bodyweightQuery.data ?? [];

  const loading = e1rmQueries.some((q) => q.isLoading) || bodyweightQuery.isLoading;
  const hasAnyData = e1rmQueries.some((q) => (q.data?.points.length ?? 0) > 0);

  const channels: NamedChannel[] = [];
  const prFlags = new Map<string, Set<string>>();
  selectedIds.forEach((id, i) => {
    const series = e1rmQueries[i]?.data;
    if (!series) return;
    const points = relative ? withBodyweight(series.points, bodyweight) : null;
    const prDates = new Set(series.points.filter((p) => p.isPr).map((p) => p.localDate));
    prFlags.set(id, prDates);
    channels.push({
      key: id,
      points: series.points.map((p, idx) => ({
        localDate: p.localDate,
        value: relative ? (points?.[idx]?.relative ?? null) : p.e1rmKg,
      })),
    });
  });
  if (!relative) {
    channels.push({
      key: '__bodyweight',
      points: bodyweight.map((b) => ({ localDate: b.localDate, value: b.weightKg })),
    });
  }

  const rows: Record<string, string | number | boolean | null>[] = mergeByDate(channels).map(
    (row) => {
      const extended: Record<string, string | number | boolean | null> = { ...row };
      for (const id of selectedIds) {
        extended[`${id}__pr`] = prFlags.get(id)?.has(String(row['date'])) ?? false;
      }
      return extended;
    },
  );

  const hasBodyweight = !relative && bodyweight.length > 0;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Strength trend
        </p>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`min-h-8 rounded-md px-2.5 text-xs font-medium transition ${
                range === r.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise picker */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {selectedIds.map((id, i) => (
          <span
            key={id}
            className="flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: colorFor(i), color: colorFor(i) }}
          >
            {byId.get(id)?.name ?? id}
            <button
              type="button"
              onClick={() => setSelectedIds((ids) => ids.filter((x) => x !== id))}
              aria-label={`Remove ${byId.get(id)?.name ?? id}`}
              className="rounded-full hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selectedIds.length < MAX_LIFTS && addableOptions.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setSelectedIds((ids) => [...ids, e.target.value]);
            }}
            aria-label="Add a lift to the chart"
            className="min-h-8 rounded-full border border-dashed border-neutral-300 bg-white px-2.5 text-xs text-neutral-500"
          >
            <option value="">+ Add a lift</option>
            {addableOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="mb-3 flex min-h-8 w-fit items-center gap-2 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={relative}
          onChange={(e) => setRelative(e.target.checked)}
          disabled={bodyweight.length === 0}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Relative strength (e1RM ÷ bodyweight)
        {bodyweight.length === 0 && (
          <span className="text-neutral-400">— log your weight first</span>
        )}
      </label>

      {loading ? (
        <div className="h-56 animate-pulse rounded-xl bg-neutral-100" />
      ) : !hasAnyData ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-neutral-500">
          No completed sets for these lifts yet. Finish a workout to start the trend.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ef" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={['auto', 'auto']}
              label={{
                value: relative ? '× bodyweight' : 'e1RM (kg)',
                angle: -90,
                position: 'insideLeft',
                fontSize: 10,
              }}
            />
            {hasBodyweight && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={['auto', 'auto']}
              />
            )}
            <Tooltip />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            {selectedIds.map((id, i) => (
              <Line
                key={id}
                yAxisId="left"
                type="monotone"
                dataKey={id}
                name={byId.get(id)?.name ?? id}
                stroke={colorFor(i)}
                strokeWidth={2}
                dot={<PrDot />}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}
            {hasBodyweight && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="__bodyweight"
                name="Bodyweight"
                stroke="#9ca3af"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
