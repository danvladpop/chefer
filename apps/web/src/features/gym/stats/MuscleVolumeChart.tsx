'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrainingExperience, VolumeGroup } from '@chefer/types';
import { landmarkFor } from '@chefer/utils';
import { MUSCLE_GROUP_OPTIONS } from '../library/filters';

// Stats tab #2 (gym_plan.md §1.3): weekly fractional sets for one muscle group
// at a time, shaded against its productive band (research §2.2/§6.1) — the
// same numbers the routine editor's "Weekly balance" card uses.

const WEEKS = 10;

export function MuscleVolumeChart({ experience }: { experience: TrainingExperience }) {
  const [group, setGroup] = useState<VolumeGroup>('chest');
  const { data, isLoading } = trpc.gym.stats.muscleVolume.useQuery({ weeks: WEEKS });

  const landmark = landmarkFor(group, experience);
  const rows = (data ?? []).map((week) => ({
    week: week.weekStart.slice(5), // "MM-DD"
    sets: Math.round((week.sets[group] ?? 0) * 10) / 10,
  }));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Weekly sets per muscle
        </p>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as VolumeGroup)}
          aria-label="Muscle group"
          className="min-h-11 max-w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700"
        >
          {MUSCLE_GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="h-52 animate-pulse rounded-xl bg-neutral-100" />
      ) : rows.every((r) => r.sets === 0) ? (
        <div className="flex h-52 items-center justify-center text-center text-sm text-neutral-500">
          No completed sets for this muscle in the last {WEEKS} weeks.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ef" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={30}
                domain={[0, (max: number) => Math.max(max, landmark.warnAbove) + 2]}
              />
              <Tooltip formatter={(val) => [`${String(val)} sets`, 'Fractional sets']} />
              <ReferenceArea
                y1={landmark.productiveMin}
                y2={landmark.productiveMax}
                fill="#059669"
                fillOpacity={0.08}
                stroke="#059669"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
              />
              <Bar
                dataKey="sets"
                name="Sets"
                fill="#944a00"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-neutral-400">
            Shaded band: the {landmark.productiveMin}–{landmark.productiveMax} sets/week most people
            need to keep growing (warn above {landmark.warnAbove}).
          </p>
        </>
      )}
    </div>
  );
}
