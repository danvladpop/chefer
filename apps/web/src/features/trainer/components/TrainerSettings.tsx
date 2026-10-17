'use client';

import { useId, useState } from 'react';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { Mail } from 'lucide-react';
import { COACHING_COPY, COACHING_LIMITS, SUPPORT_EMAIL } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

const FEEDBACK_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Trainer tools feedback')}`;

/**
 * Name and gym / city line clients see, "Send feedback", and "Turn off trainer
 * tools" (ends every coaching; the confirmation names the client count first,
 * spec §2.7, PRD 2026-10 §4.3).
 */
export function TrainerSettings({
  displayName,
  gymLine: savedGymLine,
  activeClients,
}: {
  displayName: string;
  gymLine: string | null;
  /** Active clients now; null when unknown. */
  activeClients: number | null;
}) {
  const copy = COACHING_COPY.trainer;
  const profileCopy = COACHING_COPY.trainerProfile;
  const utils = trpc.useUtils();
  const nameId = useId();
  const gymId = useId();
  const gymHintId = useId();
  const [name, setName] = useState(displayName);
  const [gymLine, setGymLine] = useState(savedGymLine ?? '');
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

  const trimmedName = name.trim();
  const trimmedGym = gymLine.trim();
  const changed =
    trimmedName.length > 0 && (trimmedName !== displayName || trimmedGym !== (savedGymLine ?? ''));

  return (
    <section
      aria-labelledby="trainer-settings-title"
      className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="trainer-settings-title" className="font-semibold text-gray-900">
        {copy.title}
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) update.mutate({ displayName: trimmedName, gymLine: trimmedGym || null });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
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
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={gymId} className="text-sm font-medium text-gray-700">
              {profileCopy.gymLine}
            </label>
            <input
              id={gymId}
              value={gymLine}
              maxLength={COACHING_LIMITS.gymLineMaxChars}
              onChange={(e) => setGymLine(e.target.value)}
              aria-describedby={gymHintId}
              className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
            />
            <p id={gymHintId} className="text-xs text-gray-500">
              {profileCopy.gymLineHint}
            </p>
          </div>
        </div>
        <Button
          type="submit"
          variant="outline"
          className="min-h-11 self-start"
          disabled={!changed}
          loading={update.isPending}
        >
          Save
        </Button>
      </form>
      <div className="flex flex-col gap-1 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <a
          href={FEEDBACK_HREF}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-1 text-sm font-medium text-gray-900 underline underline-offset-4"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {profileCopy.feedback}
        </a>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 self-start text-red-700"
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
        <div className="flex flex-col gap-2 px-5 py-4 text-sm text-gray-600">
          {activeClients !== null && activeClients > 0 && (
            <p className="font-medium text-gray-900" data-testid="trainer-turn-off-clients">
              {profileCopy.turnOffWithClients(activeClients)}
            </p>
          )}
          <p>{copy.turnOffBody}</p>
        </div>
      </Sheet>
    </section>
  );
}
