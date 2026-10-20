'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTrainerClientsHref } from '@/features/nav/mode-context';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY } from '@chefer/types';
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
  const copy = COACHING_COPY.trainer;
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
        {COACHING_COPY.trainerProfile.endCoaching}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={copy.removeClientTitle(clientName)}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={remove.isPending}
            >
              {COACHING_COPY.common.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => remove.mutate({ clientId })}
              loading={remove.isPending}
            >
              {COACHING_COPY.trainerProfile.endCoaching}
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-sm text-gray-600">{copy.removeClientBody(clientName)}</p>
      </Sheet>
    </>
  );
}
