import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { haptics, PressableScale, Text, useSnackbar, useThemeColors } from '@chefer/ui-mobile';
import { cn, formatNumber, localDateStr, slotPortion, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trackMealLogged } from '../../../lib/analytics-events';
import { trpc } from '../../../lib/trpc';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from '../../tracker/rebalance-offer-store';
import { ActionButton, BoardCard } from './parts';
import { eatenCountText, type DaySlot } from './today-helpers';

// "Your day" (10 Oct redesign, board Home): one circle per planned slot —
// done is a filled positive check, the next meal a brand ring, the rest
// empty — and the obvious way into the full day the owner asked for ("See
// full day" was too easy to miss). The state is also spoken and written
// (status line), never colour alone.
// 11 Oct owner feedback: each circle is a checkbox — tapping a planned slot
// logs it as eaten (tracker.logRecipe at the slot's portion, same call as
// Next meal's Eaten), tapping an eaten one unticks it (tracker.unlogRecipe).
// The circle flips at once and settles when Today refetches. Skipped slots
// and slots replaced by something else are changed in "Open your day".

const STATE_WORDS: Record<DaySlot['state'], string> = {
  done: 'eaten',
  next: 'next',
  upcoming: 'still to eat',
  skipped: 'skipped',
};

function SlotCircle({ state }: { state: DaySlot['state'] }) {
  const colors = useThemeColors();
  return (
    <View
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        state === 'done' && 'bg-positive',
        state === 'next' && 'border-2 border-brand bg-brand-tint',
        state === 'upcoming' && 'border-2 border-separator',
        state === 'skipped' && 'border-2 border-separator bg-surface-sunken',
      )}
    >
      {state === 'done' ? <Icon name="checkmark" color={colors.onBrand} size={20} /> : null}
      {state === 'skipped' ? <Icon name="remove" color={colors.labelTertiary} size={18} /> : null}
    </View>
  );
}

/** Ticks and unticks plan slots, with the flipped state shown until Today refetches. */
function useSlotToggle() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  // slotIndex → the state shown while the write and the refetch are in flight.
  const [pending, setPending] = useState<Record<number, DaySlot['state']>>({});
  const clear = (slotIndex: number) =>
    setPending((p) =>
      Object.fromEntries(Object.entries(p).filter(([key]) => Number(key) !== slotIndex)),
    );
  const settle = async (slotIndex: number) => {
    void utils.tracker.getDay.invalidate();
    void utils.tracker.weeklySummary.invalidate();
    await utils.dashboard.summary.invalidate();
    clear(slotIndex);
  };

  const log = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result, vars) => {
      trackMealLogged('planned', vars.mealType);
      recordRebalanceOutcome(result);
      haptics.success();
    },
    onError: (error, vars) => {
      clear(vars.slotIndex ?? -1);
      snackbar.show({ message: `Couldn't log it. ${userFacingErrorMessage(error)}` });
    },
    onSettled: (_r, error, vars) => (error ? undefined : settle(vars.slotIndex ?? -1)),
  });
  const unlog = trpc.tracker.unlogRecipe.useMutation({
    meta: { silent: true },
    onError: (error, vars) => {
      clear(vars.slotIndex ?? -1);
      snackbar.show({ message: `Couldn't untick it. ${userFacingErrorMessage(error)}` });
    },
    onSettled: (_r, error, vars) => (error ? undefined : settle(vars.slotIndex ?? -1)),
  });

  const toggle = (slot: DaySlot) => {
    if (pending[slot.slotIndex] !== undefined) return;
    const target = { recipeId: slot.recipeId, mealType: slot.mealType, slotIndex: slot.slotIndex };
    haptics.selection();
    if (slot.state === 'done') {
      setPending((p) => ({ ...p, [slot.slotIndex]: 'upcoming' }));
      unlog.mutate({ date: localDateStr(), ...target });
    } else {
      setPending((p) => ({ ...p, [slot.slotIndex]: 'done' }));
      log.mutate({
        date: localDateStr(),
        ...REBALANCE_PREVIEW,
        ...target,
        portionMultiplier: Math.min(2, Math.max(0.5, slotPortion(slot.portion))),
      });
    }
  };

  return { pending, toggle };
}

export function YourDayCard({ slots, proteinOnly }: { slots: DaySlot[]; proteinOnly: boolean }) {
  const { pending, toggle } = useSlotToggle();
  const shown = slots.map((slot) => {
    const state = pending[slot.slotIndex];
    return state === undefined ? slot : { ...slot, state, loggedAsPlanned: state === 'done' };
  });
  return (
    <BoardCard testID="your-day-card">
      <View className="flex-row items-center justify-between gap-2">
        {/* One line: see exercise-card's "Add set" (Android tablet wrap → "Your"). */}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-headline font-bold text-label"
        >
          Your day
        </Text>
        {slots.length > 0 ? (
          <Text testID="your-day-status" className="text-subhead text-label-secondary">
            {eatenCountText(shown)}
          </Text>
        ) : null}
      </View>
      {shown.length > 0 ? (
        <View className="flex-row justify-around gap-1">
          {shown.map((slot) => {
            // Skipped and replaced slots are changed in the full day, not here.
            const toggleable =
              slot.state !== 'skipped' && (slot.state !== 'done' || slot.loggedAsPlanned);
            const label = `${slot.label}${proteinOnly ? '' : `, ${slot.kcal} kcal`}, ${STATE_WORDS[slot.state]}`;
            return (
              // MO-01: press feedback via PressableScale; selection haptic on tap.
              <PressableScale
                key={slot.key}
                testID={`your-day-slot-${slot.key}`}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityHint={
                  toggleable
                    ? slot.state === 'done'
                      ? `Unticks ${slot.recipeName}`
                      : `Marks ${slot.recipeName} as eaten`
                    : 'Change it in Open your day'
                }
                accessibilityState={{
                  checked: slot.state === 'done',
                  busy: pending[slot.slotIndex] !== undefined,
                }}
                onPress={() => (toggleable ? toggle(slot) : router.push('/tracker'))}
                className="min-h-11 min-w-0 flex-1 items-center gap-1"
              >
                <SlotCircle state={slot.state} />
                <Text numberOfLines={1} className="text-subhead font-semibold text-label">
                  {slot.label}
                </Text>
                {proteinOnly ? null : (
                  <Text className="text-caption text-label-secondary">
                    {formatNumber(slot.kcal)}
                  </Text>
                )}
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <Text testID="your-day-empty" className="text-subhead text-label-secondary">
          Nothing planned today. Log what you eat as you go.
        </Text>
      )}
      <ActionButton
        testID="your-day-open"
        label="Open your day"
        icon="list"
        accessibilityHint="Shows everything planned and logged today"
        onPress={() => router.push('/tracker')}
      />
    </BoardCard>
  );
}
