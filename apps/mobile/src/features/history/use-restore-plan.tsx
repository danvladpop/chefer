import { useState } from 'react';
import { View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { getWeekStartDate, userFacingErrorMessage, weekRangeLabel } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// "Use this week again" (UX-PLAN-11): bring a past week back into THIS or NEXT
// week. Restore used to put the copy back into the week it came from — a week
// that was already over — so it could never be cooked again. The choice sits
// in a sheet (the week it replaces is named), not a bare confirm. Shared by
// the My weeks list and the past-week detail screen.

type RestoreTarget = { planId: string; weekLabel: string };

export function useRestorePlan({ onRestored }: { onRestored?: () => void } = {}) {
  // Kept after closing so the sheet's copy doesn't change mid-dismiss.
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const mutation = trpc.mealPlan.restore.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // The copy becomes that week's plan — everything derived from plans
      // (Plan tab, Home, Shop, Tracker) is stale.
      void utils.mealPlan.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.invalidate();
      void utils.shoppingList.invalidate();
      onRestored?.();
    },
  });

  const lastPlanId = mutation.variables?.planId ?? null;
  const choose = (weekOffset: 0 | 1) => {
    if (target) mutation.mutate({ planId: target.planId, weekOffset });
    setOpen(false);
  };

  return {
    /** Opens the "use this week again" sheet for this plan. */
    requestRestore: (planId: string, weekLabel: string) => {
      setTarget({ planId, weekLabel });
      setOpen(true);
    },
    /** The plan whose copy is in flight — only that row shows a spinner. */
    pendingPlanId: mutation.isPending ? lastPlanId : null,
    /** Error message for the plan whose copy last failed. */
    errorFor: (planId: string) =>
      mutation.isError && lastPlanId === planId ? userFacingErrorMessage(mutation.error) : null,
    /** True right after this plan was copied. */
    restoredPlanId: mutation.isSuccess ? lastPlanId : null,
    sheet: (
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        eyebrow="Use this week again"
        title={`Week of ${target?.weekLabel ?? ''}`}
        testID="use-again"
      >
        <Text testID="use-again-body">
          Which week should it become? It replaces whatever is planned there now — nothing is
          deleted, and the replaced plan stays in My weeks.
        </Text>
        <View className="gap-2 pt-2">
          <Button testID="use-again-this-week" size="lg" onPress={() => choose(0)}>
            {`This week (${weekRangeLabel(getWeekStartDate(0))})`}
          </Button>
          <Button
            testID="use-again-next-week"
            size="lg"
            variant="outline"
            onPress={() => choose(1)}
          >
            {`Next week (${weekRangeLabel(getWeekStartDate(1))})`}
          </Button>
          <Button
            testID="use-again-cancel"
            size="lg"
            variant="ghost"
            onPress={() => setOpen(false)}
          >
            Cancel
          </Button>
        </View>
      </Sheet>
    ),
  };
}
