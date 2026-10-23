'use client';

import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { HOUSEHOLD_SHARING_COPY as COPY } from '@chefer/types';

// Join / leave / removal / owner-gone notices (ADR 0002) as dismissible inline
// cards at the top of the Household section. There is no server push, so this
// is where the other side learns about it.

export function HouseholdNotices({ enabled }: { enabled: boolean }) {
  const utils = trpc.useUtils();
  const { data } = trpc.household.notices.useQuery(undefined, { enabled, staleTime: 30_000 });
  const dismiss = trpc.household.dismissNotice.useMutation({
    meta: { silent: true },
    onMutate: ({ id }) => {
      utils.household.notices.setData(undefined, (old) => old?.filter((n) => n.id !== id));
    },
    onSettled: () => void utils.household.notices.invalidate(),
  });

  const unread = (data ?? []).filter((n) => !n.read);
  if (!enabled || unread.length === 0) return null;

  return (
    <ul className="mb-4 space-y-2" aria-label="Household news">
      {unread.map((notice) => (
        <li
          key={notice.id}
          data-testid="household-notice"
          className="flex items-center gap-2 rounded-xl border border-[#944a00]/20 bg-[#fff3e8] py-1 pl-4 pr-1"
        >
          <p className="min-w-0 flex-1 text-sm text-gray-800">
            {COPY.notice[notice.kind](notice.name)}
          </p>
          <button
            type="button"
            onClick={() => dismiss.mutate({ id: notice.id })}
            aria-label={COPY.dismissNotice}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-white/60 hover:text-gray-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
