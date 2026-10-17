'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { UserRound, X } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { cn } from '@chefer/utils';
import { noticeViews, type NoticeSide, type NoticeView } from '../lib/notice-view';
import { useCoachingAvailability } from '../use-coaching-availability';

// ─── Coaching notice cards (PRD 2026-10 §4.2, §4.3) ───────────────────────────
// Unread `coaching.notices` for one side: the client's on Gym Today and the
// dashboard, the trainer's on Clients. "View" opens the place it is about and
// dismisses the card; the ✕ only dismisses it. Dismissed cards disappear at
// once (the server call follows), so a slow network never shows them twice.

export function useCoachingNoticeViews(side: NoticeSide) {
  const { enabled } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const notices = trpc.coaching.notices.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const dismissMutation = trpc.coaching.dismissNotice.useMutation({
    meta: { silent: true },
    onSettled: () => void utils.coaching.notices.invalidate(),
  });
  const dismiss = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
    dismissMutation.mutate({ id });
  };
  const views = enabled
    ? noticeViews(notices.data ?? [], side).filter((v) => !hidden.has(v.id))
    : [];
  return { views, dismiss };
}

export function NoticeCard({
  notice,
  onDismiss,
}: {
  notice: NoticeView;
  onDismiss: (id: string) => void;
}) {
  const c = COACHING_COPY.notices;
  return (
    <li
      className="flex min-w-0 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-950"
      data-testid={notice.testId}
    >
      <UserRound className="mt-3 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 py-2">
        <p className="min-w-0 break-words font-medium">{notice.text}</p>
        {notice.detail && (
          <p className="mt-0.5 min-w-0 break-words text-amber-900">{notice.detail}</p>
        )}
      </div>
      {notice.href && (
        <Link
          href={notice.href}
          onClick={() => onDismiss(notice.id)}
          className="flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold underline underline-offset-2 hover:bg-amber-100"
        >
          {c.view}
        </Link>
      )}
      <button
        type="button"
        aria-label={c.dismiss}
        onClick={() => onDismiss(notice.id)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-amber-800 hover:bg-amber-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/** The unread coaching notices for one side, or nothing. */
export function CoachingNoticeList({ side, className }: { side: NoticeSide; className?: string }) {
  const { views, dismiss } = useCoachingNoticeViews(side);
  if (views.length === 0) return null;
  return (
    <ul
      className={cn('flex flex-col gap-2', className)}
      aria-label="Coaching notices"
      data-testid={`coaching-notices-${side}`}
    >
      {views.map((v) => (
        <NoticeCard key={v.id} notice={v} onDismiss={dismiss} />
      ))}
    </ul>
  );
}
