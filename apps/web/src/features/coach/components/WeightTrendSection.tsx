'use client';

import { useT } from '@/lib/i18n';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  bodyWeightInUnit,
  bodyWeightUnit,
  formatBodyWeight,
  summarizeWeightTrend,
  weightChangeTone,
  weightTrendSeries,
  type StatsRangeDays,
  type UnitSystem,
} from '@chefer/utils';
import { rangeSpan, trendChangeLine } from '../coach-copy';
import { WeightEntriesList } from './WeightEntriesList';
import { WeightLogForm } from './WeightLogForm';

// ─── Progress → Weight (lane D1, trend weight) ───────────────────────────────
// The weigh-ins are faint dots; the bold line is the trend weight from
// @chefer/utils (the same smoothing the app and the Sunday review use). Every
// fetched weigh-in feeds the trend, so the line has warmed up by the time the
// chosen range starts. The change is the trend's, not first-vs-last reading,
// and it is never painted as a failure: a direction toward the goal is green,
// anything else stays neutral.

type WeightEntry = { id: string; weightKg: number; recordedAt: Date };

const TREND_COLOR = '#10b981';

export function WeightTrendSection({
  entries,
  range,
  system,
  goal,
}: {
  entries: readonly WeightEntry[];
  range: StatsRangeDays;
  system: UnitSystem;
  goal: string | null | undefined;
}) {
  const tr = useT();
  const { t } = tr;
  const unit = bodyWeightUnit(system);
  const series = weightTrendSeries(entries);
  const since = Date.now() - range * 86_400_000;
  const inRange = series.filter((p) => p.recordedAt.getTime() >= since);
  const chartData = inRange.map((p) => ({
    date: tr.date(p.recordedAt, 'short'),
    weight: bodyWeightInUnit(p.weightKg, system),
    trend: bodyWeightInUnit(p.trendKg, system),
  }));

  const latest = entries.at(-1);
  const trendNow = series.at(-1)?.trendKg;
  const summary = summarizeWeightTrend(series, { windowDays: range });
  const span = rangeSpan(tr, range);
  const change = trendChangeLine(tr, summary, system, span);
  const toward = summary ? weightChangeTone(summary.changeKg, goal) === 'positive' : false;

  return (
    <div id="weight" className="mb-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {t('today.progress.weight.heading')}
      </h2>

      {latest && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-neutral-500">{t('today.progress.weight.lastWeighIn')} </span>
            <span data-testid="progress-weight-current" className="font-semibold">
              {formatBodyWeight(latest.weightKg, system)}
            </span>
          </div>
          {trendNow != null && series.length > 1 && (
            <div>
              <span className="text-neutral-500">{t('today.progress.weight.trend')} </span>
              <span data-testid="progress-weight-trend" className="font-semibold">
                {formatBodyWeight(trendNow, system)}
              </span>
            </div>
          )}
          {change && (
            <p
              data-testid="progress-weight-change"
              className={`w-full ${toward ? 'text-emerald-600' : 'text-neutral-600'}`}
            >
              {change}
            </p>
          )}
        </div>
      )}

      {chartData.length > 1 ? (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
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
                formatter={(val, name) => [`${String(val)} ${unit}`, String(name)]}
                labelStyle={{ fontSize: 12 }}
              />
              <Line
                type="linear"
                dataKey="weight"
                stroke={TREND_COLOR}
                strokeOpacity={0.3}
                strokeWidth={1}
                dot={{ r: 3, fill: TREND_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                name={t('today.progress.weight.legendWeighIn')}
              />
              <Line
                type="monotone"
                dataKey="trend"
                stroke={TREND_COLOR}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
                name={t('today.progress.weight.legendTrend')}
              />
            </LineChart>
          </ResponsiveContainer>
          <p data-testid="progress-weight-explainer" className="mt-2 text-xs text-neutral-500">
            {t('today.progress.weight.explainer')}
          </p>
        </>
      ) : entries.length > 0 ? (
        <p data-testid="progress-weight-few" className="mb-4 text-sm text-neutral-500">
          {t('today.progress.weight.fewInRange', { span })}
        </p>
      ) : (
        <p className="mb-4 text-sm text-neutral-500">{t('today.progress.weight.empty')}</p>
      )}

      <div className="mt-4">
        <WeightLogForm lastEntry={latest ?? null} />
      </div>
      <WeightEntriesList entries={[...entries]} />
    </div>
  );
}
