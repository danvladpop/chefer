'use client';

import { useState } from 'react';
import { formatShortDay } from '@/features/coaching/lib/dates';
import { showAppToast } from '@/lib/app-toast';
import { COACHING_COPY, type InviteDto } from '@chefer/types';
import { Badge, Button } from '@chefer/ui';

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
  const copy = COACHING_COPY.common;
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
        {copied ? copy.copied : copy.copy}
      </Button>
      {canShare() && (
        <Button
          type="button"
          variant="outline"
          size={size}
          className="min-h-11"
          onClick={() => {
            void navigator
              .share({ title: 'Chefer coaching invite', url: invite.url })
              .catch(() => undefined);
          }}
        >
          {copy.share}
        </Button>
      )}
    </div>
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
  const copy = COACHING_COPY.trainer;
  if (invites.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Invites">
      {invites.map((invite) => (
        <li
          key={invite.code}
          className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          data-testid="trainer-invite-row"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words font-medium text-gray-900">
                {invite.label ?? 'Invite link'}
              </span>
              <Badge variant={invite.state === 'OPEN' ? 'info' : 'secondary'}>
                {copy.inviteStates[invite.state]}
              </Badge>
            </div>
            {invite.state === 'OPEN' && (
              <p className="text-xs text-gray-500">
                {copy.inviteExpires(formatShortDay(invite.expiresAt))}
              </p>
            )}
          </div>
          {invite.state === 'OPEN' && (
            <div className="flex flex-wrap items-center gap-2">
              <InviteActions invite={invite} compact />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-red-700"
                disabled={revoking}
                aria-label={`${copy.revoke}: ${invite.label ?? 'invite link'}`}
                onClick={() => onRevoke(invite.code)}
              >
                {copy.revoke}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
