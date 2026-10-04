'use client';

import { useId, useState } from 'react';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

/** Name clients see, and "Turn off trainer tools" (ends every link, spec §2.7). */
export function TrainerSettings({ displayName }: { displayName: string }) {
  const copy = COACHING_COPY.trainer;
  const utils = trpc.useUtils();
  const nameId = useId();
  const [name, setName] = useState(displayName);
  const [confirming, setConfirming] = useState(false);

  const update = trpc.trainer.updateProfile.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.trainer.status.invalidate();
      showAppToast({ message: 'Saved', type: 'success' });
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });
  const deactivate = trpc.trainer.deactivate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(false);
      void utils.trainer.invalidate();
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  const changed = name.trim() !== displayName && name.trim().length > 0;

  return (
    <section
      aria-labelledby="trainer-settings-title"
      className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="trainer-settings-title" className="font-semibold text-gray-900">
        {copy.title}
      </h2>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) update.mutate({ displayName: name.trim() });
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium text-gray-700">
            {copy.displayName}
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={COACHING_LIMITS.displayNameMaxChars}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="min-h-11"
          disabled={!changed}
          loading={update.isPending}
        >
          Save
        </Button>
      </form>
      <div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-red-700"
          onClick={() => setConfirming(true)}
        >
          {copy.turnOff}
        </Button>
      </div>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={copy.turnOff}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={deactivate.isPending}
            >
              {COACHING_COPY.common.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => deactivate.mutate()}
              loading={deactivate.isPending}
            >
              {copy.turnOff}
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-sm text-gray-600">{copy.turnOffBody}</p>
      </Sheet>
    </section>
  );
}
