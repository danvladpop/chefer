'use client';

import { useEffect, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Copy, Share2 } from 'lucide-react';
import { HOUSEHOLD_SHARING_COPY as COPY, type HouseholdOpenInviteDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { firstNameOf, userFacingErrorMessage } from '@chefer/utils';

// ─── "Invite Maria" (ADR 0002) ────────────────────────────────────────────────
// Shows the profile's open invite, or makes one when there is none (a new one
// replaces the old server-side, so an open invite is reused, never re-made).
// Copy link / Share link / Cancel invite. The event fires when the link
// actually leaves the page (copied or shared), not when it is made.

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The Clipboard API; when it is missing or refused (insecure context, denied
 * permission) the link is selected so the person can copy it themselves.
 */
async function copyText(text: string, input: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    input?.focus();
    input?.select();
    return false;
  }
}

export function InviteSheet({
  open,
  onClose,
  member,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  member: { id: string; name: string };
  /** The profile's open invite, when there is one. */
  existing: HouseholdOpenInviteDto | null;
}) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const ownerName = firstNameOf(me ?? {});
  const linkRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [canShare, setCanShare] = useState(false);

  const create = trpc.household.invites.create.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.household.sharing.invalidate(),
  });
  const revoke = trpc.household.invites.revoke.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.household.sharing.invalidate();
      onClose();
    },
  });

  const createInvite = create.mutate;
  const needsInvite = open && existing === null;
  // One request per opening (StrictMode runs effects twice, and a second
  // create would revoke the first link).
  const requested = useRef(false);
  useEffect(() => {
    if (!open) requested.current = false;
    if (!needsInvite || requested.current) return;
    requested.current = true;
    createInvite({ memberId: member.id });
  }, [open, needsInvite, member.id, createInvite]);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const invite = existing ?? create.data ?? null;
  const url = invite?.url ?? '';

  const onCopy = async () => {
    if (!url) return;
    const ok = await copyText(url, linkRef.current);
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) capture('household_invite_created', { via: 'copy' });
  };

  const onShare = async () => {
    if (!url) return;
    try {
      await navigator.share({ text: COPY.shareMessage(ownerName), url });
      capture('household_invite_created', { via: 'share' });
    } catch {
      // Dismissed share sheet (AbortError) or unsupported target: nothing to do.
    }
  };

  const error = create.error ?? revoke.error;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.inviteSheetTitle(member.name)}
      description={COPY.inviteSheetBody(member.name)}
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            {canShare && (
              <Button
                type="button"
                className="min-h-11 sm:flex-1"
                disabled={!url}
                onClick={() => void onShare()}
              >
                <Share2 aria-hidden="true" />
                {COPY.shareLink}
              </Button>
            )}
            <Button
              type="button"
              variant={canShare ? 'outline' : 'default'}
              className="min-h-11 sm:flex-1"
              disabled={!url}
              onClick={() => void onCopy()}
            >
              <Copy aria-hidden="true" />
              {COPY.copyLink}
            </Button>
          </div>
          {invite && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-red-700 hover:bg-red-50 hover:text-red-800"
              loading={revoke.isPending}
              onClick={() => revoke.mutate({ code: invite.code })}
            >
              {COPY.revoke}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-4">
        {create.isPending && !invite ? (
          <div className="h-11 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        ) : (
          <input
            ref={linkRef}
            type="text"
            readOnly
            value={url}
            aria-label={COPY.inviteSheetTitle(member.name)}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="household-invite-link"
            className="min-h-11 w-full rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm text-foreground"
          />
        )}
        <p className="text-xs text-muted-foreground">{COPY.inviteExpires}</p>
        <p role="status" aria-live="polite" className="text-sm">
          {copyState === 'copied' && <span className="text-emerald-700">{COPY.copied}</span>}
          {copyState === 'failed' && <span className="text-red-700">{COPY.copyFailed}</span>}
        </p>
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">
            <span className="min-w-0 flex-1">
              {create.error ? COPY.inviteLoadFailed : userFacingErrorMessage(error)}
            </span>
            {create.error && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => createInvite({ memberId: member.id })}
              >
                {COPY.tryAgain}
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
