'use client';

import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { SKIPPED_LABEL, youHadLine } from '@/features/tracker/lib/slot-copy';
import { mealLabel, slotTargetOf, type SlotFlow } from '@/features/tracker/lib/use-slot-actions';
import type { RouterOutputs } from '@/lib/trpc';

// ─── Today's replaced / skipped slots (WP-06) ─────────────────────────────────
// A slot you swapped for something else ("You had: Shawarma (≈ 775 kcal)") or
// skipped stays visible on Today with an Undo, long after the toast is gone.
// Plain words, muted: neither is a failure.

type Slot = NonNullable<RouterOutputs['dashboard']['summary']['today']['slots']>[number];

export function TodaySlotNotes({ slots, flow }: { slots: Slot[]; flow: SlotFlow }) {
  const { proteinOnly } = useNumbersMode();
  const rows = slots.filter((s) => s.status === 'replaced' || s.status === 'skipped');
  if (rows.length === 0) return null;
  return (
    <ul data-testid="today-slot-notes" className="flex flex-col gap-2">
      {rows.map((s) => {
        const target = slotTargetOf(s.mealType, s.slotIndex);
        const entryId = s.replacedBy?.entryId;
        return (
          <li
            key={`${s.mealType}:${s.slotIndex}`}
            data-testid={`today-slot-${s.status}-${s.slotIndex}`}
            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-1"
          >
            <p className="min-w-0 flex-1 py-2 text-sm text-neutral-700">
              <span className="font-semibold">{mealLabel(s.mealType)}</span>
              {' · '}
              {s.status === 'replaced' && s.replacedBy
                ? youHadLine(
                    s.replacedBy.name,
                    s.replacedBy.kcal,
                    s.replacedBy.protein,
                    proteinOnly,
                  )
                : SKIPPED_LABEL}
            </p>
            {(s.status === 'skipped' || entryId) && (
              <button
                type="button"
                data-testid={`today-slot-undo-${s.slotIndex}`}
                aria-label={`Undo for ${s.mealType}`}
                onClick={() =>
                  s.status === 'skipped'
                    ? flow.unskip(target)
                    : entryId && flow.undoReplacement(entryId, target)
                }
                className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-[#944a00] hover:bg-[#fff2e2]"
              >
                Undo
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
