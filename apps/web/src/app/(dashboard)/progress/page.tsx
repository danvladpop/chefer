'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { Flame, Scale, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function ProgressPage() {
  const [weightInput, setWeightInput] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  const { data: monthly, isLoading } = trpc.tracker.monthlySummary.useQuery(undefined, {
    staleTime: 60_000,
  });
  const { data: weightHistory, refetch: refetchWeight } = trpc.tracker.weightHistory.useQuery(
    { days: 90 },
    { staleTime: 60_000 },
  );

  const logWeightMutation = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setWeightSaved(true);
      setWeightInput('');
      setTimeout(() => setWeightSaved(false), 3000);
      void refetchWeight();
    },
  });

  const chartData = (monthly?.days ?? []).map((d) => ({
    date: format(parseISO(d.date), 'dd MMM'),
    logged: d.hasLog ? d.totalKcal : null,
    target: monthly?.dailyCalorieTarget ?? 2000,
    protein: d.hasLog ? Math.round(d.totalProtein) : null,
    carbs: d.hasLog ? Math.round(d.totalCarbs) : null,
    fat: d.hasLog ? Math.round(d.totalFat) : null,
  }));

  const weightData = (weightHistory ?? []).map((w) => ({
    date: format(new Date(w.recordedAt), 'dd MMM'),
    weight: w.weightKg,
  }));

  const daysLogged = (monthly?.days ?? []).filter((d) => d.hasLog).length;
  const loggedDays = (monthly?.days ?? []).filter((d) => d.hasLog);
  const avgKcal =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.totalKcal, 0) / loggedDays.length)
      : 0;
  const target = monthly?.dailyCalorieTarget ?? 2000;
  const diffPct = target > 0 ? Math.round(((avgKcal - target) / target) * 100) : 0;

  const latestWeight = weightHistory?.[weightHistory.length - 1]?.weightKg;
  const firstWeight = weightHistory?.[0]?.weightKg;
  const weightDelta =
    latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">INSIGHTS</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Progress</h1>
      </div>

      {/* Stat summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          {
            icon: <Flame className="h-4 w-4 text-[#944a00]" />,
            label: 'Days logged (28d)',
            value: `${daysLogged}`,
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
            label: 'Avg daily kcal',
            value: avgKcal > 0 ? avgKcal.toLocaleString() : '—',
          },
          {
            icon: <Scale className="h-4 w-4 text-emerald-500" />,
            label: 'vs. target',
            value: avgKcal > 0 ? `${diffPct > 0 ? '+' : ''}${diffPct}%` : '—',
          },
        ].map((s, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              {s.icon}
              {s.label}
            </div>
            <p className="text-xl font-bold text-neutral-800">{s.value}</p>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Calorie line chart */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Calories — Last 28 Days
            </p>
            {daysLogged === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
                No log data yet — start tracking in the{' '}
                <a href="/tracker" className="ml-1 text-[#944a00] hover:underline">
                  Tracker
                </a>
                .
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={3}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={(val) => [`${String(val)} kcal`]} />
                  <ReferenceLine
                    y={target}
                    stroke="#d1d5db"
                    strokeDasharray="4 4"
                    label={{ value: 'Target', position: 'right', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="logged"
                    stroke="#944a00"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    name="Logged"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Macro stacked bar chart */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Macros — Last 28 Days (g)
            </p>
            {daysLogged === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
                No log data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={3}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="protein" name="Protein" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="carbs" name="Carbs" stackId="a" fill="#10b981" />
                  <Bar dataKey="fat" name="Fat" stackId="a" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Weight section */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Weight Tracking
            </p>

            {/* Stats */}
            {latestWeight != null && (
              <div className="mb-4 flex gap-4 text-sm">
                <div>
                  <span className="text-neutral-400">Current: </span>
                  <span className="font-semibold">{latestWeight} kg</span>
                </div>
                {firstWeight != null && firstWeight !== latestWeight && (
                  <div>
                    <span className="text-neutral-400">Change: </span>
                    <span
                      className={`font-semibold ${weightDelta && weightDelta < 0 ? 'text-emerald-600' : 'text-red-500'}`}
                    >
                      {weightDelta !== null && weightDelta > 0 ? '+' : ''}
                      {weightDelta?.toFixed(1)} kg
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Chart */}
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={weightData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.floor(weightData.length / 6)}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip formatter={(val) => [`${String(val)} kg`]} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Weight (kg)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="mb-4 text-sm text-neutral-400">
                No weight entries yet. Log your first entry below.
              </p>
            )}

            {/* Log weight input */}
            <div className="mt-4 flex gap-2">
              <input
                type="number"
                step="0.1"
                min="30"
                max="300"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="Weight in kg (e.g. 72.5)"
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]"
              />
              <button
                type="button"
                onClick={() => {
                  const kg = parseFloat(weightInput);
                  if (!isNaN(kg) && kg > 0) logWeightMutation.mutate({ weightKg: kg });
                }}
                disabled={!weightInput || logWeightMutation.isPending || weightSaved}
                className="rounded-xl bg-[#944a00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
              >
                {weightSaved ? '✓ Saved' : 'Log'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
