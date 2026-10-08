'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Switch } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// Weekly emails (audit P2-5, F-PM-14): the Monday "your week is ready" email
// and the Sunday recap, every tier. Both are on by default and only go to a
// confirmed address — an unconfirmed one gets a "send confirmation link"
// action here. The emails' own unsubscribe link flips the same switches.

export interface WeeklyEmailPreferences {
  weekReady: boolean;
  weeklyRecap: boolean;
  emailConfirmed: boolean;
  email: string;
}

type Key = 'weekReady' | 'weeklyRecap';

const ROWS: { key: Key; title: string; description: string }[] = [
  {
    key: 'weekReady',
    title: 'Monday: your week is ready',
    description: "This week's dinners and your estimated shopping list.",
  },
  {
    key: 'weeklyRecap',
    title: 'Sunday: your week in review',
    description: 'Meals logged, days on target, weight and workouts.',
  },
];

/**
 * T-39.3: existing accounts whose weekly-email switches predate the S15
 * default change (weeklyEmailReady/Recap now default false for NEW rows
 * only) see this once. Shown only when the notice hasn't fired yet AND at
 * least one digest is currently on — a fresh post-change account already
 * starts both off, so "Yours are still on" would be the wrong sentence for it.
 */
function EmailDefaultsNotice({
  onKeepOn,
  onTurnOff,
  busy,
}: {
  onKeepOn: () => void;
  onTurnOff: () => void;
  busy: boolean;
}) {
  return (
    <div
      data-testid="email-defaults-notice"
      className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p>
        We&apos;ve changed how emails work: they&apos;re now off unless you turn them on. Yours are
        still on.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onKeepOn}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          Keep them on
        </button>
        <button
          type="button"
          onClick={onTurnOff}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          Turn them off
        </button>
      </div>
    </div>
  );
}

export function WeeklyEmailToggles({ initial }: { initial: WeeklyEmailPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const utils = trpc.useUtils();
  const meQuery = trpc.user.me.useQuery();
  const dismissNotice = trpc.user.dismissEmailDefaultsNotice.useMutation({
    onSuccess: (res) =>
      utils.user.me.setData(undefined, (prev) =>
        prev ? { ...prev, emailDefaultsNoticeAt: res.emailDefaultsNoticeAt } : prev,
      ),
  });
  const showEmailDefaultsNotice =
    meQuery.data?.emailDefaultsNoticeAt === null && (prefs.weekReady || prefs.weeklyRecap);

  const save = trpc.notifications.setEmailPreferences.useMutation({
    meta: { silent: true },
    onSuccess: (res) => setPrefs(res),
    // Roll back only the switch that failed.
    onError: (_err, vars) =>
      setPrefs((p) => ({
        ...p,
        ...(vars.weekReady !== undefined && { weekReady: !vars.weekReady }),
        ...(vars.weeklyRecap !== undefined && { weeklyRecap: !vars.weeklyRecap }),
      })),
  });
  const resend = trpc.notifications.resendConfirmation.useMutation({ meta: { silent: true } });

  const toggle = (key: Key, next: boolean) => {
    setPrefs((p) => ({ ...p, [key]: next }));
    save.mutate({ [key]: next });
  };

  const keepEmailDefaults = () => dismissNotice.mutate();
  const turnOffEmailDefaults = () => {
    setPrefs((p) => ({ ...p, weekReady: false, weeklyRecap: false }));
    save.mutate({ weekReady: false, weeklyRecap: false });
    dismissNotice.mutate();
  };

  return (
    <section
      aria-labelledby="weekly-email-heading"
      className="mt-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="weekly-email-heading" className="font-semibold text-gray-900">
        Weekly emails
      </h2>

      {showEmailDefaultsNotice && (
        <EmailDefaultsNotice
          onKeepOn={keepEmailDefaults}
          onTurnOff={turnOffEmailDefaults}
          busy={dismissNotice.isPending || save.isPending}
        />
      )}

      <p className="mt-1 break-words text-sm text-gray-500">Sent to {prefs.email}.</p>

      <ul className="mt-2 divide-y">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <p id={`weekly-email-${row.key}`} className="text-sm font-medium text-gray-900">
                {row.title}
              </p>
              <p className="text-xs text-gray-500">{row.description}</p>
            </div>
            <Switch
              checked={prefs[row.key]}
              onCheckedChange={(next) => toggle(row.key, next)}
              aria-labelledby={`weekly-email-${row.key}`}
              disabled={save.isPending}
            />
          </li>
        ))}
      </ul>

      {!prefs.emailConfirmed && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>Confirm your email address to start getting these.</p>
          {resend.isSuccess ? (
            <p role="status" className="mt-2 font-medium">
              {resend.data.alreadyConfirmed
                ? 'Your address is already confirmed.'
                : 'Sent. Check your inbox for the confirmation link.'}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {resend.isPending ? 'Sending…' : 'Send confirmation link'}
            </button>
          )}
          {resend.isError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {userFacingErrorMessage(resend.error)}
            </p>
          )}
        </div>
      )}

      {save.isError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Couldn&apos;t save that. Try again.
        </p>
      )}
    </section>
  );
}
