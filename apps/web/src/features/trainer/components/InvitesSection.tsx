'use client';

import { trpc } from '@/lib/trpc';
import { InviteList } from './InviteList';

/** The trainer's invites, open first, with Revoke; nothing while there are none. */
export function InvitesSection() {
  const utils = trpc.useUtils();
  const invites = trpc.trainer.invites.list.useQuery(undefined, { retry: false });
  const revoke = trpc.trainer.invites.revoke.useMutation({
    onSuccess: () => void utils.trainer.invites.list.invalidate(),
  });

  const open = (invites.data ?? []).filter((i) => i.state === 'OPEN');
  const past = (invites.data ?? []).filter((i) => i.state !== 'OPEN');
  if (open.length === 0 && past.length === 0) return null;

  return (
    <section aria-labelledby="trainer-invites-title" className="flex flex-col gap-2">
      <h2 id="trainer-invites-title" className="font-semibold text-gray-900">
        Invites
      </h2>
      <InviteList
        invites={[...open, ...past]}
        revoking={revoke.isPending}
        onRevoke={(code) => revoke.mutate({ code })}
      />
    </section>
  );
}
