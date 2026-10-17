import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  AnimatedCheck,
  Celebration,
  FloatUp,
  haptics,
  PressableScale,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { formatNumber, localDateStr, slotPortion, userFacingErrorMessage } from '@chefer/utils';
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
  if (state === 'skipped') {
    return (
      <View className="h-9 w-9 items-center justify-center rounded-full border-2 border-separator bg-surface-sunken">
        <Icon name="remove" color={colors.labelTertiary} size={18} />
      </View>
    );
  }
  // MO-16: the disc fills and the tick draws in when a slot is ticked.
  return (
    <AnimatedCheck
      checked={state === 'done'}
      size={36}
      fillColor={colors.positive}
      checkColor={colors.onBrand}
      ringColor={state === 'next' ? colors.brand : colors.separator}
      emptyColor={state === 'next' ? colors.brandTint : 'transparent'}
    />
  );
}

/** Ticks and unticks plan slots, with the flipped state shown until Today refetches. */
function useSlotToggle() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  // slotIndex → the state shown while the write and the refetch are in flight.
  const [pending, setPending] = useState<Record<number, DaySlot['state']>>({});
  // slotIndex → how many times it was ticked here (drives the "+kcal" float).
  const [floats, setFloats] = useState<Record<number, number>>({});
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
      // The tap already gave a tick; the day's last meal gets the success (Today).
    },
    onError: (error, vars) => {
      clear(vars.slotIndex ?? -1);
      haptics.error();
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
    if (slot.state === 'done') {
      haptics.selection();
      setPending((p) => ({ ...p, [slot.slotIndex]: 'upcoming' }));
      unlog.mutate({ date: localDateStr(), ...target });
    } else {
      haptics.tick();
      setFloats((f) => ({ ...f, [slot.slotIndex]: (f[slot.slotIndex] ?? 0) + 1 }));
      setPending((p) => ({ ...p, [slot.slotIndex]: 'done' }));
      log.mutate({
        date: localDateStr(),
        ...REBALANCE_PREVIEW,
        ...target,
        portionMultiplier: Math.min(2, Math.max(0.5, slotPortion(slot.portion))),
      });
    }
  };

  return { pending, floats, toggle };
}

export function YourDayCard({
  slots,
  proteinOnly,
  celebrate = 0,
}: {
  slots: DaySlot[];
  proteinOnly: boolean;
  /** Bump to fire the day-complete confetti here (when Today has no gauge). */
  celebrate?: number;
}) {
  const colors = useThemeColors();
  const { pending, floats, toggle } = useSlotToggle();
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
                <View>
                  <SlotCircle state={slot.state} />
                  {proteinOnly ? null : (
                    <FloatUp play={floats[slot.slotIndex] ?? 0}>
                      <Text className="text-caption font-bold text-positive">
                        {`+${formatNumber(slot.kcal)} kcal`}
                      </Text>
                    </FloatUp>
                  )}
                </View>
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
      <Celebration
        testID="your-day-celebration"
        play={celebrate}
        colors={[colors.brand, colors.positive, colors.attention, colors.info]}
        origin={{ x: 0.5, y: 0.35 }}
      />
    </BoardCard>
  );
}
