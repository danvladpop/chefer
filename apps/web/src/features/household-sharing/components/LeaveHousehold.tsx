'use client';

import { useState } from 'react';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// A partner leaves the owner's household (ADR 0003). The profile stays with the
// owner; the partner's own plans come back — so every plan and list cache goes.

export function LeaveHousehold({ ownerName }: { ownerName: string }) {
  const { t } = useT();
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const leave = trpc.household.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      capture('household_left', { by: 'partner' });
      setConfirming(false);
      void utils.household.invalidate();
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="mt-4 min-h-11 text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setConfirming(true)}
      >
        {t('household.sharing.leave')}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('household.sharing.leave')}
      className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3"
    >
      <p className="text-sm text-red-900">{t('household.sharing.leaveConfirm', { ownerName })}</p>
      {leave.error && (
        <p role="alert" className="text-sm text-red-700">
          {userFacingErrorMessage(leave.error)}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:flex-1"
          onClick={() => setConfirming(false)}
          disabled={leave.isPending}
        >
          {t('household.sharing.cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 sm:flex-1"
          loading={leave.isPending}
          onClick={() => leave.mutate()}
        >
          {t('household.sharing.leave')}
        </Button>
      </div>
    </div>
  );
}
