import { View } from 'react-native';
import { Card } from '@chefer/ui-mobile';
import type { RouterOutputs } from '../../../lib/trpc';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { SlotStatusLine } from '../../tracker/slot-controls';
import { SLOT_COPY, youHadText } from '../../tracker/slot-copy';
import { MealTypeBadge } from './meal-type-badge';

// What became of today's planned meals that were NOT eaten as planned (WP-06):
// the ones the user swapped ("You had: Shawarma · normal (≈ 780 kcal)") and the
// ones they skipped ("Skipped"). Muted and neutral — information, not a
// warning — each with its Remove / Undo. The replacement's numbers are already
// in the day's eaten total; the planned meal is out of the plan and "remaining".

type TodaySlot = NonNullable<RouterOutputs['dashboard']['summary']['today']['slots']>[number];

export function TodaySlotNotes({
  slots,
  onRemoveReplacement,
  onUndoSkip,
}: {
  /** Only the replaced and skipped slots are shown; pass `today.slots` minus any a card already shows. */
  slots: readonly TodaySlot[];
  onRemoveReplacement: (entryId: string) => void;
  onUndoSkip: (slot: { mealType: string; slotIndex: number }) => void;
}) {
  const { proteinOnly } = useNumbersMode();
  const rows = slots.filter((s) => s.status === 'replaced' || s.status === 'skipped');
  if (rows.length === 0) return null;
  return (
    <Card testID="today-slot-notes" className="gap-3 py-3">
      {rows.map((slot) => {
        const testID = `today-slot-${slot.mealType}-${slot.slotIndex}`;
        const replacedBy = slot.status === 'replaced' ? slot.replacedBy : undefined;
        const entryId = replacedBy?.entryId;
        return (
          <View key={`${slot.mealType}-${slot.slotIndex}`} className="gap-1">
            <MealTypeBadge mealType={slot.mealType} />
            {slot.status === 'skipped' ? (
              <SlotStatusLine
                testID={testID}
                text={SLOT_COPY.skippedLabel}
                actionLabel={SLOT_COPY.undo}
                onAction={() => onUndoSkip({ mealType: slot.mealType, slotIndex: slot.slotIndex })}
              />
            ) : (
              <SlotStatusLine
                testID={testID}
                text={
                  replacedBy
                    ? youHadText(
                        {
                          custom: { name: replacedBy.name },
                          kcal: replacedBy.kcal,
                          protein: replacedBy.protein,
                        },
                        proteinOnly,
                      )
                    : 'You had something else'
                }
                actionLabel={entryId ? SLOT_COPY.remove : undefined}
                onAction={entryId ? () => onRemoveReplacement(entryId) : undefined}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}
