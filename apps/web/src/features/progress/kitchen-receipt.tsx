'use client';

import type { LevelInfo, Receipt } from '@chefer/types';
import { CountUp, ProgressBar } from '@chefer/ui';
import { cn, levelLabel, PROGRESS_COPY, receiptLineLabel, xpLabel } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';

// ─── Kitchen receipt (mockups 02 and 03, lane C3) ─────────────────────────────
// What a finished cook or workout earned: a line per reason ("+25 Cooked at
// home"), the total counting up (MO-06) and the level bar. The caller decides
// whether to show it (gate on, receipt not null, "Show XP & levels" on).

export function KitchenReceipt({
  receipt,
  level,
  className,
}: {
  receipt: Receipt;
  /** The user's level after this receipt, for the bar at the bottom. */
  level?: LevelInfo | undefined;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`receipt-${receipt.id}`}
      data-testid="kitchen-receipt"
      className={cn('w-full rounded-card border bg-white p-4 text-left shadow-e1', className)}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <h2 id={`receipt-${receipt.id}`} className="min-w-0 text-base font-bold text-gray-900">
          {PROGRESS_COPY.receiptTitle}
        </h2>
        <p className="shrink-0 text-xl font-bold text-orange-700" data-testid="receipt-total">
          {/* MO-06: the total counts up once. */}
          <CountUp value={receipt.xp} format={(n) => xpLabel(Math.round(n))} />
        </p>
      </div>
      <ul className="mt-2 divide-y divide-gray-100">
        {receipt.lines.map((line, i) => (
          <li
            key={`${line.code}-${i}`}
            className="flex min-h-9 min-w-0 items-center justify-between gap-3 py-1.5 text-sm text-gray-800"
          >
            <span className="min-w-0">{receiptLineLabel(line.code, line.detail)}</span>
            <span className="shrink-0 font-bold text-orange-700">
              {line.xp >= 0 ? '+' : ''}
              {line.xp}
            </span>
          </li>
        ))}
      </ul>
      {receipt.capped && <p className="mt-1 text-xs text-gray-600">{PROGRESS_COPY.softCapNote}</p>}
      {level && (
        <div className="mt-3 flex min-w-0 items-center gap-3 border-t pt-3 text-sm text-gray-700">
          <span className="shrink-0 font-semibold">{levelLabel(level.level)}</span>
          <ProgressBar
            progress={level.xpForLevel > 0 ? level.xpIntoLevel / level.xpForLevel : 0}
            label={`${PROGRESS_WEB_COPY.levelLabel} ${level.level}: ${level.xpIntoLevel} of ${level.xpForLevel} XP`}
            color="#d97706"
            className="min-w-0 flex-1"
          />
          <span className="shrink-0 tabular-nums">
            {PROGRESS_WEB_COPY.xpToLevel(level.xpIntoLevel, level.xpForLevel)}
          </span>
        </div>
      )}
    </section>
  );
}
