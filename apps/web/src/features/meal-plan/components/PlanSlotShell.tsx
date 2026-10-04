'use client';

import type { ReactNode } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { SlotActionsMenu } from '@/features/tracker/components/SlotActionsMenu';
import { SKIPPED_LABEL, youHadLine } from '@/features/tracker/lib/slot-copy';
import { slotTargetOf, type SlotFlow } from '@/features/tracker/lib/use-slot-actions';
import { cn, type DayEntry, type SlotState } from '@chefer/utils';

// ─── A Plan slot with its flexible-eating state (WP-06) ───────────────────────
// Wraps one plan meal card for TODAY (or a day already past this week): the ⋯
// "Ate something else" / "Skipped it" overflow under it, or — once the slot was
// replaced or skipped — a calm line ("You had: Shawarma (≈ 775 kcal)" /
// "Skipped") with an Undo, and the card itself muted. The state comes from
// `slotStates(...)`, the same helper the tracker uses. The strip sits OUTSIDE
// the card: cards are links, and a link can't hold a button group.

/** What a Plan day needs to show a slot's state: today's log and the shared flow. */
export interface PlanSlotUi {
  flow: SlotFlow;
  loggedMeals: readonly DayEntry[];
  skippedSlots: readonly { mealType: string; slotIndex: number }[];
}

interface PlanSlotShellProps {
  mealType: string;
  slotIndex: number;
  plannedName: string;
  state: SlotState<DayEntry> | undefined;
  flow: SlotFlow;
  children: ReactNode;
}

export function PlanSlotShell({
  mealType,
  slotIndex,
  plannedName,
  state,
  flow,
  children,
}: PlanSlotShellProps) {
  const { proteinOnly } = useNumbersMode(); // WP-08
  const slot = slotTargetOf(mealType, slotIndex);
  const status = state?.status ?? 'planned';
  const muted = status === 'replaced' || status === 'skipped';
  const entryId = state?.status === 'replaced' ? state.entry.entryId : undefined;

  return (
    <div
      className="flex flex-col"
      data-testid={`plan-slot-${mealType}-${slotIndex}`}
      data-status={status}
    >
      <div className={cn(muted && 'opacity-60')}>{children}</div>
      {muted ? (
        <div className="flex items-center gap-2 px-1">
          <p
            data-testid={`plan-slot-note-${mealType}-${slotIndex}`}
            className="min-w-0 flex-1 py-2 text-xs text-gray-700"
          >
            {state?.status === 'replaced' && state.entry.custom
              ? youHadLine(
                  state.entry.custom.name,
                  state.entry.kcal,
                  state.entry.protein,
                  proteinOnly,
                )
              : SKIPPED_LABEL}
          </p>
          {(status === 'skipped' || entryId) && (
            <button
              type="button"
              data-testid={`plan-slot-undo-${mealType}-${slotIndex}`}
              aria-label={`Undo for ${mealType}`}
              onClick={() =>
                status === 'skipped'
                  ? flow.unskip(slot)
                  : entryId && flow.undoReplacement(entryId, slot)
              }
              className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-[#944a00] hover:bg-[#fff2e2]"
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <SlotActionsMenu
            slotLabel={slot.label}
            plannedName={plannedName}
            canSkip={status === 'planned'}
            onAteElse={() => flow.openAteElse(slot)}
            onSkip={() => flow.skip(slot)}
          />
        </div>
      )}
    </div>
  );
}
