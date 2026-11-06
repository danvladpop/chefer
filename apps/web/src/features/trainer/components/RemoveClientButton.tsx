'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTrainerClientsHref } from '@/features/nav/mode-context';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

/** "End coaching": a confirm sheet, then back to the list (spec §2.7, PRD 2026-10 §4.3). */
export function RemoveClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const clientsHref = useTrainerClientsHref();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const remove = trpc.trainer.clients.remove.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setOpen(false);
      void utils.trainer.clients.list.invalidate();
      router.push(clientsHref);
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 text-red-700"
        onClick={() => setOpen(true)}
      >
        {t('coaching.trainer.profile.endCoaching')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('coaching.trainer.removeClientTitle', { client: clientName })}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={remove.isPending}
            >
              {t('coaching.common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => remove.mutate({ clientId })}
              loading={remove.isPending}
            >
              {t('coaching.trainer.profile.endCoaching')}
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-sm text-gray-600">
          {t('coaching.trainer.removeClientBody', { client: clientName })}
        </p>
      </Sheet>
    </>
  );
}
