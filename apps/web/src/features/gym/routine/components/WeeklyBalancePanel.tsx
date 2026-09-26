'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { MuscleVolume, RoutineHint, VolumeGroup } from '@chefer/types';
import { cn, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { hintId, loadDismissedHints, saveDismissedHints, visibleHints } from '../hints-storage';

export interface WeeklyBalancePanelProps {
  /** Used to namespace dismissed-hint storage; pass the draft's server id even mid-edit. */
  routineId: string;
  volume: MuscleVolume[];
  hints: RoutineHint[];
  title?: string;
  className?: string;
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function VolumeRow({ volume }: { volume: MuscleVolume }) {
  const label = VOLUME_GROUP_LABELS[volume.group as VolumeGroup];
  const scale = Math.max(
    volume.warnAbove * 1.15,
    volume.fractional * 1.05,
    volume.productiveMax * 1.1,
    1,
  );
  const floorPct = (volume.floor / scale) * 100;
  const bandPct = Math.max(0, (volume.productiveMax / scale) * 100 - floorPct);
  const valuePct = Math.min(100, (volume.fractional / scale) * 100);
  const overWarn = volume.fractional > volume.warnAbove;
  const underFloor = volume.fractional < volume.floor;
  const barColor = overWarn ? 'bg-amber-500' : underFloor ? 'bg-gray-400' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-xs text-gray-500" title={label}>
        {label}
      </span>
      <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-100"
          style={{ left: `${floorPct}%`, width: `${bandPct}%` }}
          aria-hidden="true"
        />
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all', barColor)}
          style={{ width: `${valuePct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-gray-500">
        {round1(volume.fractional)}
      </span>
    </div>
  );
}

/**
 * Fractional sets per muscle against the productive band (research §2.2), plus
 * the dismissible V1–V11 hints (§2.3). Dismissals are remembered per routine in
 * localStorage; shared by the routine view and the editor's live side panel.
 */
export function WeeklyBalancePanel({
  routineId,
  volume,
  hints,
  title = 'Weekly balance',
  className,
}: WeeklyBalancePanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(loadDismissedHints(routineId));
  }, [routineId]);

  const shown = useMemo(() => visibleHints(hints, dismissed), [hints, dismissed]);

  const dismiss = (hint: RoutineHint) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(hintId(hint));
      saveDismissedHints(routineId, next);
      return next;
    });
  };

  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-white p-4', className)}>
      <h3 className="font-serif text-sm font-semibold text-gray-900">{title}</h3>
      <div className="mt-3 flex flex-col gap-2.5">
        {volume.map((v) => (
          <VolumeRow key={v.group} volume={v} />
        ))}
      </div>

      {shown.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-gray-100 pt-3">
          {shown.map((hint) => (
            <div
              key={hintId(hint)}
              className={cn(
                'flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs',
                hint.level === 'warning'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-gray-50 text-gray-600',
              )}
            >
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  hint.level === 'warning' ? 'bg-amber-500' : 'bg-amber-400',
                )}
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1">{hint.message}</p>
              <button
                type="button"
                onClick={() => dismiss(hint)}
                aria-label="Dismiss hint"
                className="touch-target relative -m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-current opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
