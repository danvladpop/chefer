import { useEffect, useRef, useState, type ComponentProps, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Text } from '@chefer/ui-mobile';
import { PLAN_MEAL_MENU_COPY, type SlotRef } from '@chefer/utils';
import { useAfterSheetExit } from '../meal-plan/after-sheet-exit';
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

/**
 * FB7-11: the Plan's "…" menu is this same sheet with more rows. Without
 * `menu` (Today, tracker) it is exactly the two WP-06 actions.
 */
export type SlotMenu = {
  /**
   * Whether "Ate something else" / "Skipped it" apply — only while the slot is
   * still to eat. Default true.
   */
  logActions?: boolean;
  /** "Keep in next plans" / "Stop keeping in next plans" (the slot's pin). */
  pin?: { pinned: boolean; onToggle: () => void };
  /** "Add a side dish" — opens another sheet, so it runs after this one exits. */
  onAddSide?: () => void;
  /** "Remove from plan" — only offered on a side slot. */
  onRemove?: () => void;
};

export type SlotTarget = SlotRef & {
  /** The planned meal's name (the sheet's eyebrow). */
  name: string;
  /** Extra rows for the Plan's "…" menu. */
  menu?: SlotMenu;
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
  const afterExit = useAfterSheetExit();

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
  const menu: SlotMenu = target?.menu ?? {};
  const logActions = menu.logActions !== false;

  const host = (
    <>
      {target && slot && (
        <Sheet
          visible={step === 'menu' || step === 'else'}
          onClose={close}
          onExited={() => {
            finishHandoff();
            afterExit.onExited();
          }}
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
              {menu.pin && (
                <MenuRow
                  testID="slot-action-pin"
                  icon={menu.pin.pinned ? 'bookmark' : 'bookmark-outline'}
                  label={menu.pin.pinned ? PLAN_MEAL_MENU_COPY.unpin : PLAN_MEAL_MENU_COPY.pin}
                  hint={
                    menu.pin.pinned ? PLAN_MEAL_MENU_COPY.unpinHint : PLAN_MEAL_MENU_COPY.pinHint
                  }
                  onPress={() => {
                    close();
                    menu.pin?.onToggle();
                  }}
                />
              )}
              {logActions && (
                <>
                  <MenuRow
                    testID="slot-action-ate-else"
                    icon="restaurant-outline"
                    label={SLOT_COPY.ateElse}
                    hint={SLOT_COPY.ateElseHint}
                    chevron
                    onPress={() => setStep('else')}
                  />
                  <MenuRow
                    testID="slot-action-skip"
                    icon="remove-circle-outline"
                    iconColor="#6b7280"
                    label={SLOT_COPY.skipIt}
                    hint={SLOT_COPY.skipItHint}
                    onPress={() => {
                      close();
                      actions.skipSlot(slot);
                    }}
                  />
                </>
              )}
              {menu.onAddSide && (
                <MenuRow
                  testID="slot-action-add-side"
                  icon="add-circle-outline"
                  label={PLAN_MEAL_MENU_COPY.addSide}
                  hint={PLAN_MEAL_MENU_COPY.addSideHint}
                  onPress={() => {
                    // Another sheet follows: wait until this one is fully gone.
                    if (menu.onAddSide) afterExit.schedule(menu.onAddSide);
                    close();
                  }}
                />
              )}
              {menu.onRemove && (
                <MenuRow
                  testID="slot-action-remove"
                  icon="trash-outline"
                  iconColor="#b91c1c"
                  label={PLAN_MEAL_MENU_COPY.removeSide}
                  hint={PLAN_MEAL_MENU_COPY.removeSideHint}
                  onPress={() => {
                    close();
                    menu.onRemove?.();
                  }}
                />
              )}
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

function MenuRow({
  testID,
  icon,
  iconColor = '#944a00',
  label,
  hint,
  chevron = false,
  onPress,
}: {
  testID: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  hint: string;
  chevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className="min-w-0 flex-1 text-base font-medium text-gray-900">{label}</Text>
      {chevron && <Ionicons name="chevron-forward" size={16} color="#9ca3af" />}
    </Pressable>
  );
}
