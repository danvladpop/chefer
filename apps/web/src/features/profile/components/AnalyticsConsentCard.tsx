'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAnalyticsConsent, setAnalyticsConsent } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Switch } from '@chefer/ui';

// ─── Usage analytics consent (backlog P0-6) ───────────────────────────────────
// Opt-in, default off: linking product-analytics events to the account needs
// consent (see the consent model in lib/analytics.ts). Off, Chefer only counts
// anonymous, cookieless usage. Web only: the mobile app sends no analytics.

export function AnalyticsConsentCard() {
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const userId = user?.id;
  const [granted, setGranted] = useState(false);

  // Read after mount: the choice lives in this browser's storage.
  useEffect(() => {
    if (userId) setGranted(getAnalyticsConsent(userId) === 'granted');
  }, [userId]);

  const onChange = (next: boolean) => {
    if (!userId) return;
    setAnalyticsConsent(userId, next ? 'granted' : 'denied');
    setGranted(next);
  };

  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="analytics-consent-card"
    >
      <h2 className="mb-3 font-semibold text-gray-800">Usage analytics</h2>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="analytics-consent-label" className="text-sm font-medium text-gray-900">
            Link usage analytics to my account
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {granted
              ? 'On: we see which features you use, tied to your account ID (never your name or email), to improve Chefer.'
              : 'Off: we only count anonymous usage, with no cookies and nothing linked to you.'}{' '}
            Applies to this browser.{' '}
            <Link
              href="/privacy#analytics"
              className="touch-target relative text-[#944a00] underline underline-offset-4"
            >
              Privacy policy
            </Link>
          </p>
        </div>
        <Switch
          checked={granted}
          onCheckedChange={onChange}
          aria-labelledby="analytics-consent-label"
          disabled={!userId}
        />
      </div>
    </div>
  );
}
