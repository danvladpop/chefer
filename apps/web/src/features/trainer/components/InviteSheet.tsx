'use client';

import { useId, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, COACHING_LIMITS, type InviteDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { InviteActions } from './InviteList';

/** Clients → Invite a client: optional private label, then the link to copy or share. */
export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copy = COACHING_COPY.trainer;
  const utils = trpc.useUtils();
  const labelId = useId();
  const hintId = useId();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<InviteDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.trainer.invites.create.useMutation({
    meta: { silent: true },
    onSuccess: (invite) => {
      setCreated(invite);
      void utils.trainer.invites.list.invalidate();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const close = () => {
    setLabel('');
    setCreated(null);
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={copy.invite}
      size="md"
      footer={
        created ? (
          <div className="flex justify-end">
            <Button type="button" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              {COACHING_COPY.common.cancel}
            </Button>
            <Button
              type="button"
              loading={create.isPending}
              onClick={() => {
                setError(null);
                const trimmed = label.trim();
                create.mutate(trimmed ? { label: trimmed } : {});
              }}
            >
              {copy.createLink}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {created ? (
          <div className="flex flex-col gap-3" data-testid="trainer-invite-created">
            <p className="text-sm text-gray-700">
              Send this link to your client. It works once and expires in{' '}
              {COACHING_LIMITS.inviteTtlDays} days.
            </p>
            <input
              readOnly
              aria-label="Invite link"
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 text-base sm:text-sm"
            />
            <InviteActions invite={created} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={labelId} className="text-sm font-medium text-gray-700">
              {copy.inviteLabel}
            </label>
            <input
              id={labelId}
              value={label}
              maxLength={COACHING_LIMITS.inviteLabelMaxChars}
              onChange={(e) => setLabel(e.target.value)}
              aria-describedby={hintId}
              className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
            />
            <p id={hintId} className="text-xs text-gray-500">
              {copy.inviteLabelHint}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
