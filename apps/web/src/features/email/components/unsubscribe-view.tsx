'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';

// One-click unsubscribe from a weekly email (audit P2-5). The signed token in
// the link is the authorization — no login. The mutation runs from the
// browser, not on page load server-side, so mail scanners that prefetch the
// link don't unsubscribe anyone. "Undo" re-subscribes with the same link.

// The scopes the API answers with; each one's sentence is in
// `today.settings.unsubscribe.{unsubscribed,resubscribed}.<scope>` (lane K3 adds the
// trainer's weekly check-in, lane K4 a trainer's daily summary of quiet clients).
type Scope = 'WEEK_READY' | 'WEEKLY_RECAP' | 'ALL' | 'COACHING_CHECK_IN' | 'COACHING_QUIET_DIGEST';

const LINK_CLASSES =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:text-primary/80';

export function UnsubscribeView() {
  const { t } = useT();
  const token = useSearchParams().get('token') ?? '';
  const mutation = trpc.notifications.unsubscribe.useMutation({ meta: { silent: true } });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // once, even under StrictMode's double effect
    mutation.mutate({ token });
  }, [token, mutation]);

  if (!token || mutation.isError) {
    return (
      <div className="space-y-3">
        <p>{t('today.settings.unsubscribe.invalid')}</p>
        <p className="text-muted-foreground">{t('today.settings.unsubscribe.invalidHint')}</p>
        <Link href="/preferences" className={LINK_CLASSES}>
          {t('today.settings.unsubscribe.openPreferences')}
        </Link>
      </div>
    );
  }

  if (!mutation.data) {
    return (
      <p role="status" className="text-muted-foreground">
        {t('today.settings.unsubscribe.updating')}
      </p>
    );
  }

  const scope: Scope = mutation.data.scope;
  const resubscribed = mutation.variables.resubscribe === true;

  return (
    <div className="space-y-4">
      <p role="status">
        {resubscribed
          ? t(`today.settings.unsubscribe.resubscribed.${scope}`)
          : t(`today.settings.unsubscribe.unsubscribed.${scope}`)}
      </p>
      {!resubscribed && (
        <button
          type="button"
          onClick={() => mutation.mutate({ token, resubscribe: true })}
          disabled={mutation.isPending}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 font-medium hover:bg-muted disabled:opacity-60"
        >
          {t('today.settings.unsubscribe.undo')}
        </button>
      )}
      <p>
        <Link href="/preferences" className={LINK_CLASSES}>
          {t('today.settings.unsubscribe.manageAll')}
        </Link>
      </p>
    </div>
  );
}
