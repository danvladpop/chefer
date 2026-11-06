'use client';

import { useState } from 'react';
import { formatShortDayT } from '@/features/coaching/lib/dates';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import type { InviteDto } from '@chefer/types';
import { Badge, Button, Sheet } from '@chefer/ui';
import { InviteQrCode } from './InviteQrCode';

// ─── Invites (spec §2.2) ──────────────────────────────────────────────────────

/** Copy to the clipboard; the web has `navigator.clipboard` (no native module concerns). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** `navigator.share` where the browser has it (phones); undefined elsewhere. */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function InviteActions({
  invite,
  compact = false,
}: {
  invite: InviteDto;
  compact?: boolean;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const size = compact ? 'sm' : 'default';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={size}
        className="min-h-11"
        onClick={async () => {
          const ok = await copyText(invite.url);
          if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } else {
            showAppToast({ message: invite.url });
          }
        }}
      >
        {copied ? t('coaching.common.copied') : t('coaching.common.copy')}
      </Button>
      {canShare() && (
        <Button
          type="button"
          variant="outline"
          size={size}
          className="min-h-11"
          onClick={() => {
            void navigator
              .share({ title: t('coaching.trainer.invites.shareTitle'), url: invite.url })
              .catch(() => undefined);
          }}
        >
          {t('coaching.common.share')}
        </Button>
      )}
    </div>
  );
}

/** "Show QR code" on an open invite: the same link, scannable on the gym floor. */
function InviteQrButton({ invite }: { invite: InviteDto }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const name = invite.label ?? t('coaching.trainer.invites.linkNameLower');
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-label={t('coaching.trainer.invites.qrShowFor', { name })}
        onClick={() => setOpen(true)}
      >
        {t('coaching.trainer.qr.show')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('coaching.trainer.qr.title')}
        size="sm"
        footer={
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpen(false)}>
              {t('common.actions.done')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 px-5 py-4">
          {invite.label && <p className="text-sm font-medium text-gray-900">{invite.label}</p>}
          <InviteQrCode url={invite.url} />
          <p className="text-center text-sm text-gray-600">{t('coaching.trainer.qr.hint')}</p>
          <p className="text-xs text-gray-500">
            {t('coaching.trainer.inviteExpires', { date: formatShortDayT(invite.expiresAt, t) })}
          </p>
        </div>
      </Sheet>
    </>
  );
}

export function InviteList({
  invites,
  onRevoke,
  revoking,
}: {
  invites: InviteDto[];
  onRevoke: (code: string) => void;
  revoking: boolean;
}) {
  const { t } = useT();
  if (invites.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label={t('coaching.trainer.invites.heading')}>
      {invites.map((invite) => (
        <li
          key={invite.code}
          className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          data-testid="trainer-invite-row"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words font-medium text-gray-900">
                {invite.label ?? t('coaching.trainer.invites.linkName')}
              </span>
              <Badge variant={invite.state === 'OPEN' ? 'info' : 'secondary'}>
                {t(`coaching.trainer.inviteStates.${invite.state}`)}
              </Badge>
            </div>
            {invite.state === 'OPEN' && (
              <p className="text-xs text-gray-500">
                {t('coaching.trainer.inviteExpires', {
                  date: formatShortDayT(invite.expiresAt, t),
                })}
              </p>
            )}
          </div>
          {invite.state === 'OPEN' && (
            <div className="flex flex-wrap items-center gap-2">
              <InviteActions invite={invite} compact />
              <InviteQrButton invite={invite} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-red-700"
                disabled={revoking}
                aria-label={t('coaching.trainer.invites.revokeFor', {
                  name: invite.label ?? t('coaching.trainer.invites.linkNameLower'),
                })}
                onClick={() => onRevoke(invite.code)}
              >
                {t('coaching.trainer.revoke')}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
