'use client';

import { useId, useState } from 'react';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { COACHING_LIMITS, type InviteDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { InviteActions } from './InviteList';
import { InviteQrCode } from './InviteQrCode';

/** Clients → Invite a client: optional private label, then the link to copy or share. */
export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
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
      title={t('coaching.trainer.invite')}
      size="md"
      footer={
        created ? (
          <div className="flex justify-end">
            <Button type="button" onClick={close}>
              {t('common.actions.done')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              {t('coaching.common.cancel')}
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
              {t('coaching.trainer.createLink')}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {created ? (
          <div className="flex flex-col gap-3" data-testid="trainer-invite-created">
            <p className="text-sm text-gray-700">
              {t('coaching.trainer.invites.sendThis', { count: COACHING_LIMITS.inviteTtlDays })}
            </p>
            <input
              readOnly
              aria-label={t('coaching.trainer.invites.linkName')}
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 text-base sm:text-sm"
            />
            <InviteActions invite={created} />
            <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4">
              <InviteQrCode url={created.url} />
              <p className="text-center text-xs text-gray-500">{t('coaching.trainer.qr.hint')}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={labelId} className="text-sm font-medium text-gray-700">
              {t('coaching.trainer.inviteLabel')}
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
              {t('coaching.trainer.inviteLabelHint')}
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
