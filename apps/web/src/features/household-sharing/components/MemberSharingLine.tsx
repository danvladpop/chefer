'use client';

import { useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Send } from 'lucide-react';
import { HOUSEHOLD_SHARING_COPY as COPY, type HouseholdSharingStatus } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { InviteSheet } from './InviteSheet';

// ─── The sharing line under a member row (ADR 0002) ───────────────────────────
// Owner / solo: an adult profile without an account gets "Invite to Chefer"
// (and "Invite sent" while a link is open); a claimed profile shows "Has
// Chefer", who manages its terms, and "Remove from household".
// Partner: only the note on someone else's claimed profile.

export type SharingMember = {
  id: string;
  name: string;
  isKid: boolean;
  hasAccount?: boolean;
  isYou?: boolean;
};

const badgeCls =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';

export function MemberSharingLine({
  member,
  status,
}: {
  member: SharingMember;
  status: HouseholdSharingStatus;
}) {
  const utils = trpc.useUtils();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const removePartner = trpc.household.removePartner.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      capture('household_left', { by: 'owner' });
      setConfirmingRemove(false);
      void utils.household.invalidate();
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  const claimed = member.hasAccount === true;

  if (status.role === 'PARTNER') {
    if (!claimed || member.isYou) return null;
    return (
      <p className="mt-1 text-xs text-muted-foreground">{COPY.claimedProfileNote(member.name)}</p>
    );
  }

  if (claimed) {
    const link = status.partners.find((p) => p.memberId === member.id);
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid={`household-claimed-${member.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${badgeCls} bg-emerald-50 text-emerald-800`}>{COPY.joinedBadge}</span>
          <span className="min-w-0 text-xs text-muted-foreground">
            {COPY.claimedProfileNote(member.name)}
          </span>
        </div>
        {link &&
          (confirmingRemove ? (
            <div
              role="group"
              aria-label={COPY.remove}
              className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <p className="text-sm text-red-900">{COPY.removeConfirm(member.name)}</p>
              {removePartner.error && (
                <p role="alert" className="text-sm text-red-700">
                  {userFacingErrorMessage(removePartner.error)}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 sm:flex-1"
                  disabled={removePartner.isPending}
                  onClick={() => setConfirmingRemove(false)}
                >
                  {COPY.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11 sm:flex-1"
                  loading={removePartner.isPending}
                  onClick={() => removePartner.mutate({ linkId: link.linkId })}
                >
                  {COPY.remove}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="flex min-h-11 items-center self-start text-sm font-medium text-red-700 underline-offset-4 hover:underline"
            >
              {COPY.remove}
            </button>
          ))}
      </div>
    );
  }

  if (member.isKid) return null;
  const pending = status.invites.find((i) => i.memberId === member.id) ?? null;
  if (!pending && !status.canInvite) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        aria-label={`${COPY.inviteButton}: ${member.name}`}
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/5"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {COPY.inviteButton}
      </button>
      {pending && (
        <span
          className={`${badgeCls} bg-amber-50 text-amber-900`}
          data-testid="household-invite-pending"
        >
          {COPY.invitePending}
        </span>
      )}
      {inviteOpen && (
        <InviteSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          member={member}
          existing={pending}
        />
      )}
    </div>
  );
}
