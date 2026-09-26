import { useState } from 'react';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';

// Restore a past week, behind a confirm (audit F-M-PREM-1-1: Restore fired on
// the first tap and one shared mutation spun every row's button at once).
// Shared by the History list and the plan detail screen.

type RestoreTarget = { planId: string; weekLabel: string };

export function useRestorePlan({ onRestored }: { onRestored?: () => void } = {}) {
  // Kept after closing so the sheet's copy doesn't change mid-dismiss.
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const mutation = trpc.mealPlan.restore.useMutation({
    onSuccess: () => {
      // The restored copy becomes that week's plan — everything derived from
      // plans (Plan tab, Home, Shop, Tracker) is stale.
      void utils.mealPlan.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.invalidate();
      void utils.shoppingList.invalidate();
      onRestored?.();
    },
  });

  const lastPlanId = mutation.variables?.planId ?? null;

  return {
    /** Opens the confirm sheet for this plan. */
    requestRestore: (planId: string, weekLabel: string) => {
      setTarget({ planId, weekLabel });
      setOpen(true);
    },
    /** The plan whose restore is in flight — only that row shows a spinner. */
    pendingPlanId: mutation.isPending ? lastPlanId : null,
    /** Error message for the plan whose restore last failed. */
    errorFor: (planId: string) =>
      mutation.isError && lastPlanId === planId ? mutation.error.message : null,
    /** True right after this plan was restored. */
    restoredPlanId: mutation.isSuccess ? lastPlanId : null,
    sheet: (
      <ConfirmSheet
        testID="restore-confirm"
        visible={open}
        onClose={() => setOpen(false)}
        title="Restore this week?"
        body={`This becomes the plan for the week of ${target?.weekLabel ?? ''} again, replacing whatever is planned there now. Nothing is deleted — the replaced plan stays in History.`}
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (target) mutation.mutate({ planId: target.planId });
          setOpen(false);
        }}
      />
    ),
  };
}
