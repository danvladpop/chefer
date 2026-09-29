'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getAnalyticsConsent,
  getAnonymousAnalyticsConsent,
  setAnalyticsConsent,
  setAnonymousAnalyticsConsent,
} from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Switch } from '@chefer/ui';

// ─── Usage analytics consent (backlog P0-6, T-12.3) ───────────────────────────
// Two switches: "Send anonymous usage counts" (Q-8 default: on) and "Link
// usage to my account" (default off, and disabled while anonymous is off —
// linking is a superset of anonymous). Every change is logged server-side
// via privacy.recordAnalyticsConsent (T-39.2) so the choice is provable, on
// top of the local storage that actually enforces it. Web only: the mobile
// app has its own analytics-consent-card.tsx.

export function AnalyticsConsentCard() {
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const userId = user?.id;
  const [anonymous, setAnonymous] = useState(true);
  const [linked, setLinked] = useState(false);
  const recordConsent = trpc.privacy.recordAnalyticsConsent.useMutation();

  // Read after mount: the choice lives in this browser's storage.
  useEffect(() => {
    if (!userId) return;
    setAnonymous(getAnonymousAnalyticsConsent(userId) === 'granted');
    setLinked(getAnalyticsConsent(userId) === 'granted');
  }, [userId]);

  const onAnonymousChange = (next: boolean) => {
    if (!userId) return;
    setAnonymousAnalyticsConsent(userId, next ? 'granted' : 'denied');
    setAnonymous(next);
    // Turning anonymous off also turns linking off (see lib/analytics.ts).
    if (!next) setLinked(false);
    recordConsent.mutate(next ? { anonymous: true } : { anonymous: false, linked: false });
  };

  const onLinkedChange = (next: boolean) => {
    if (!userId) return;
    setAnalyticsConsent(userId, next ? 'granted' : 'denied');
    setLinked(next);
    recordConsent.mutate({ linked: next });
  };

  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="analytics-consent-card"
    >
      <h2 className="mb-3 font-semibold text-gray-800">Usage analytics</h2>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="analytics-anonymous-label" className="text-sm font-medium text-gray-900">
            Send anonymous usage counts
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            Which screens and buttons get used, with no name, email or health information, and
            nothing that identifies you.
          </p>
        </div>
        <Switch
          checked={anonymous}
          onCheckedChange={onAnonymousChange}
          aria-labelledby="analytics-anonymous-label"
          disabled={!userId}
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3 border-t pt-3">
        <div className="min-w-0">
          <p id="analytics-consent-label" className="text-sm font-medium text-gray-900">
            Link usage to my account
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {linked
              ? 'On: we see which features you use, tied to your account ID (never your name or email), to improve Chefer.'
              : 'Off: nothing is tied to you.'}{' '}
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
          checked={linked}
          onCheckedChange={onLinkedChange}
          aria-labelledby="analytics-consent-label"
          disabled={!userId || !anonymous}
        />
      </div>
    </div>
  );
}
