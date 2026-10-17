'use client';

import type { SlotFlow } from '../lib/use-slot-actions';
import { AteSomethingElseSheet } from './AteSomethingElseSheet';
import { QuickAddSheet } from './QuickAddSheet';
import { ScanMealButton } from './ScanMealButton';

// The overlays behind "Ate something else" for one surface (WP-06): the sheet
// itself plus the two flows it hands off to — the quick-add text flow and the
// photo scan — both pre-targeted at the slot (they send `replacesSlot`).
export function SlotActionsHost({
  flow,
  date,
  isPremium,
}: {
  flow: SlotFlow;
  /** YYYY-MM-DD day the slot belongs to. */
  date: string;
  isPremium: boolean | undefined;
}) {
  const slot = flow.target ?? undefined;
  return (
    <>
      <AteSomethingElseSheet
        open={flow.sheetOpen}
        onClose={flow.closeSheet}
        target={flow.target}
        onLog={flow.replace}
        onDescribe={flow.startDescribe}
        onSnap={flow.startSnap}
      />
      {slot && (
        <QuickAddSheet
          date={date}
          hideTrigger
          open={flow.describeOpen}
          onOpenChange={flow.setDescribeOpen}
          replacesSlot={{ mealType: slot.mealType, slotIndex: slot.slotIndex }}
          onLogged={flow.onLogged}
          onLoggedEntry={flow.onLoggedEntry}
        />
      )}
      <ScanMealButton
        hideButton
        openRef={flow.scanOpenRef}
        date={date}
        isPremium={isPremium}
        onLogged={flow.onLogged}
        onLoggedEntry={flow.onLoggedEntry}
        replacesSlot={slot && { mealType: slot.mealType, slotIndex: slot.slotIndex }}
      />
    </>
  );
}
