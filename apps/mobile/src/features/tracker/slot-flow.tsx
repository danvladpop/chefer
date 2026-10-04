import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Text } from '@chefer/ui-mobile';
import type { SlotRef } from '@chefer/utils';
import { AteSomethingElseBody } from './ate-something-else';
import { QuickAddSheet } from './quick-add-sheet';
import { mealLabel, SLOT_COPY } from './slot-copy';
import { useSlotActions } from './use-slot-actions';

// "Ate something else" / "Skipped it" for ONE planned slot, shared by Today
// (hero and tonight cards), the tracker and the Plan day (WP-06).
//
//   const flow = useSlotFlow(date);
//   <SlotOverflowButton onPress={() => flow.openMenu({ mealType, slotIndex, name })} />
//   {flow.host}                       // once per screen
//
// The overflow opens ONE sheet: first the two actions, then — for "Ate
// something else" — the three ways in (quick estimate, recent, describe or
// snap). Describe hands over to the existing Log sheet, aimed at the slot;
// the hand-off waits for this sheet to be fully gone because iOS cannot
// present a second modal while the first is still dismissing.

export type SlotTarget = SlotRef & {
  /** The planned meal's name (the sheet's eyebrow). */
  name: string;
};

type Step = 'menu' | 'else' | 'describe' | null;

/** If the sheet's own "fully gone" signal never comes, open the Log sheet anyway after this long. */
const HANDOFF_FALLBACK_MS = 700;

export function useSlotFlow(date: string): {
  openMenu: (target: SlotTarget) => void;
  actions: ReturnType<typeof useSlotActions>;
  host: ReactElement;
} {
  const actions = useSlotActions(date);
  const [target, setTarget] = useState<SlotTarget | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [handoff, setHandoff] = useState(false);
  const handoffRef = useRef(false);

  const finishHandoff = () => {
    if (!handoffRef.current) return;
    handoffRef.current = false;
    setHandoff(false);
    setStep('describe');
  };
  useEffect(() => {
    if (!handoff) return;
    const timer = setTimeout(finishHandoff, HANDOFF_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [handoff]);

  const close = () => {
    handoffRef.current = false;
    setHandoff(false);
    setStep(null);
  };

  const slot: SlotRef | null = target
    ? { mealType: target.mealType, slotIndex: target.slotIndex }
    : null;

  const host = (
    <>
      {target && slot && (
        <Sheet
          visible={step === 'menu' || step === 'else'}
          onClose={close}
          onExited={finishHandoff}
          title={step === 'else' ? SLOT_COPY.ateElse : mealLabel(target.mealType)}
          eyebrow={step === 'else' ? mealLabel(target.mealType) : target.name}
          testID="slot-sheet"
        >
          {step === 'else' ? (
            <AteSomethingElseBody
              visible
              date={date}
              slot={slot}
              onReplace={(input) => {
                close();
                actions.replaceSlot(input);
              }}
              onDescribe={() => {
                handoffRef.current = true;
                setHandoff(true);
                setStep(null);
              }}
              onScanned={close}
            />
          ) : (
            <View className="gap-2">
              <Pressable
                testID="slot-action-ate-else"
                accessibilityRole="button"
                accessibilityHint={SLOT_COPY.ateElseHint}
                onPress={() => setStep('else')}
                className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                <Ionicons name="restaurant-outline" size={20} color="#944a00" />
                <Text className="min-w-0 flex-1 text-base font-medium text-gray-900">
                  {SLOT_COPY.ateElse}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Pressable>
              <Pressable
                testID="slot-action-skip"
                accessibilityRole="button"
                accessibilityHint={SLOT_COPY.skipItHint}
                onPress={() => {
                  close();
                  actions.skipSlot(slot);
                }}
                className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                <Ionicons name="remove-circle-outline" size={20} color="#6b7280" />
                <Text className="min-w-0 flex-1 text-base font-medium text-gray-900">
                  {SLOT_COPY.skipIt}
                </Text>
              </Pressable>
            </View>
          )}
        </Sheet>
      )}
      {target && slot && (
        <QuickAddSheet
          visible={step === 'describe'}
          onClose={close}
          date={date}
          onLogged={() => undefined}
          targetSlot={slot}
          onSlotLogged={({ name, entryId }) =>
            actions.confirmReplaced(name, target.mealType, entryId)
          }
        />
      )}
    </>
  );

  return {
    openMenu: (next) => {
      setTarget(next);
      setStep('menu');
    },
    actions,
    host,
  };
}
