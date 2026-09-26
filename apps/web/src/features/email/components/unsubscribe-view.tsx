'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

// One-click unsubscribe from a weekly email (audit P2-5). The signed token in
// the link is the authorization — no login. The mutation runs from the
// browser, not on page load server-side, so mail scanners that prefetch the
// link don't unsubscribe anyone. "Undo" re-subscribes with the same link.

const WHAT: Record<'WEEK_READY' | 'WEEKLY_RECAP' | 'ALL', string> = {
  WEEK_READY: 'the Monday "your week is ready" email',
  WEEKLY_RECAP: 'the Sunday "your week in review" email',
  ALL: 'weekly emails',
};

const LINK_CLASSES =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:text-primary/80';

export function UnsubscribeView() {
  const token = useSearchParams().get('token') ?? '';
  const mutation = trpc.notifications.unsubscribe.useMutation();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // once, even under StrictMode's double effect
    mutation.mutate({ token });
  }, [token, mutation]);

  if (!token || mutation.isError) {
    return (
      <div className="space-y-3">
        <p>This unsubscribe link is invalid or has expired.</p>
        <p className="text-muted-foreground">
          You can switch weekly emails off in Preferences after signing in.
        </p>
        <Link href="/preferences" className={LINK_CLASSES}>
          Open Preferences
        </Link>
      </div>
    );
  }

  if (!mutation.data) {
    return (
      <p role="status" className="text-muted-foreground">
        Updating your email settings…
      </p>
    );
  }

  const { scope } = mutation.data;
  const resubscribed = mutation.variables.resubscribe === true;

  return (
    <div className="space-y-4">
      <p role="status">
        {resubscribed
          ? `You're subscribed again to ${WHAT[scope]}.`
          : `You're unsubscribed from ${WHAT[scope]}.`}
      </p>
      {!resubscribed && (
        <button
          type="button"
          onClick={() => mutation.mutate({ token, resubscribe: true })}
          disabled={mutation.isPending}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 font-medium hover:bg-muted disabled:opacity-60"
        >
          Undo
        </button>
      )}
      <p>
        <Link href="/preferences" className={LINK_CLASSES}>
          Manage all email settings
        </Link>
      </p>
    </div>
  );
}
