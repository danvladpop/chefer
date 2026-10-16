import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { IconButton, PressableScale, showSnackbar, Text, useThemeColors } from '@chefer/ui-mobile';
import { DAY_FIT_COPY, describeDayFit, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { trpc } from '../../lib/trpc';

// Day rebalance (2026-10-16): a log for today let the server resize today's
// still-open meals so the day stays on target (`dayFit` on the log result).
// The log's own "Logged … · Undo" bar stays untouched; this note says what
// was resized, next to the week-rebalance banner, with its own Undo.

export interface DayFitLike {
  planId: string;
  dayOfWeek: number;
  changes: { mealType: string; to: number }[];
  previousPortions: number[];
}

let note: DayFitLike | null = null;
const listeners = new Set<() => void>();

function set(next: DayFitLike | null): void {
  note = next;
  listeners.forEach((l) => l());
}

/** Called with every log result (via recordRebalanceOutcome). */
export function recordDayFit(fit: DayFitLike | null | undefined): void {
  if (fit && fit.changes.length > 0) set(fit);
}

export function resetDayFitNoteForTests(): void {
  note = null;
  listeners.clear();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const read = () => note;

export function DayFitNote({ onChanged }: { onChanged?: () => void }) {
  const current = useSyncExternalStore(subscribe, read, read);
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const restore = trpc.mealPlan.restoreDayPortions.useMutation({ meta: { silent: true } });
  if (!current) return null;
  const message = describeDayFit(current, { isToday: true });
  if (!message) return null;
  const refresh = () => {
    void utils.mealPlan.invalidate();
    void utils.dashboard.invalidate();
    void utils.tracker.getDay.invalidate();
    onChanged?.();
  };
  return (
    <View
      testID="dayfit-note"
      accessibilityRole="summary"
      className="flex-row items-center gap-2 rounded-card bg-brand-tint py-1.5 pl-3.5 pr-1"
    >
      <Text className="min-w-0 flex-1 text-subhead text-label">{message}</Text>
      <PressableScale
        testID="dayfit-note-undo"
        accessibilityRole="button"
        onPress={() =>
          restore.mutate(
            {
              planId: current.planId,
              dayOfWeek: current.dayOfWeek,
              portions: current.previousPortions,
            },
            {
              onSuccess: () => set(null),
              onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }),
              onSettled: refresh,
            },
          )
        }
        className="min-h-11 justify-center px-2"
      >
        <Text className="text-subhead font-semibold text-brand">{DAY_FIT_COPY.undo}</Text>
      </PressableScale>
      <IconButton
        testID="dayfit-note-dismiss"
        accessibilityLabel={DAY_FIT_COPY.refitDismiss}
        icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
        onPress={() => set(null)}
      />
    </View>
  );
}
