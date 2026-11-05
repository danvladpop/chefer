'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isMobileUserAgent } from '@/features/coaching/lib/open-in-app';
import { HealthDeclinedNotice } from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { Translator } from '@chefer/i18n';
import type { HouseholdInvitePreview } from '@chefer/types';
import { Button } from '@chefer/ui';
import { householdPortionWords, userFacingErrorMessage } from '@chefer/utils';
import { isHealthConsentRequired } from '../lib/conflict';
import { appHouseholdJoinUrl } from '../lib/open-in-app';
import { safetyEdited, SafetyTermsEditor, type SafetyLists } from './SafetyTermsEditor';

// ─── /household/join/<code> (ADR 0003, business_flow §17.1) ──────────────────
// The coaching invite pattern: previewInvite → the join screen → join. Every
// invite state has one sentence. On a phone the page first offers the app
// (`chefer://household/join/<code>`); a signed-out phone gets
// SignedOutHouseholdInvite instead (middleware rewrite). The partner confirms
// or fixes the profile's allergies, diet and dislikes before joining: they are
// health data, so the health-consent guard runs first, and again if the server
// still says consent is missing.

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function Message({ body }: { body: string }) {
  const { t } = useT();
  return (
    <Page>
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        {t('household.sharing.joinPageTitle')}
      </h1>
      <p className="mt-3 text-sm text-gray-700" data-testid="household-invite-message">
        {body}
      </p>
      <Link
        href="/meal-plan"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        {t('household.sharing.goToMeals')}
      </Link>
    </Page>
  );
}

/** The one sentence for a state that cannot join, or null for OK. */
export function inviteStateMessage(
  t: Translator['t'],
  preview: HouseholdInvitePreview,
): string | null {
  switch (preview.state) {
    case 'OK':
      return null;
    case 'IN_OTHER_HOUSEHOLD':
      return t('household.sharing.inviteState.IN_OTHER_HOUSEHOLD', {
        owner: preview.currentOwnerName ?? '',
      });
    default:
      return t(`household.sharing.inviteState.${preview.state}`);
  }
}

/** "a standard portion" / "half a portion" / "1½ portions", for joinPortion. */
export function householdPortionText(t: Translator['t'], portionFactor: number): string {
  const words = householdPortionWords(portionFactor);
  switch (words.kind) {
    case 'fraction':
      return t('household.sharing.portion.fraction', { value: words.value });
    case 'many':
      return t('household.sharing.portion.many', { value: words.value });
    default:
      return t(`household.sharing.portion.${words.kind}`);
  }
}

const JOIN_SHARES = ['week', 'list', 'safety'] as const;

const EMPTY: SafetyLists = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

export function HouseholdJoinFlow({ code }: { code: string }) {
  const { t } = useT();
  const router = useRouter();
  const utils = trpc.useUtils();
  // Always fresh: the answer changes while the page is away (link used, left a household).
  const preview = trpc.household.previewInvite.useQuery(
    { code },
    { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
  );
  const [choice, setChoice] = useState<'ask' | 'web'>('web');
  const [draft, setDraft] = useState<SafetyLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  useEffect(() => {
    if (isMobileUserAgent(navigator.userAgent)) setChoice('ask');
  }, []);

  const data = preview.data;
  const profile = data?.state === 'OK' ? data.profile : undefined;
  const original: SafetyLists = profile
    ? {
        allergies: profile.allergies,
        dietaryRestrictions: profile.dietaryRestrictions,
        dislikedIngredients: profile.dislikedIngredients,
      }
    : EMPTY;

  // The editable lists start from what the owner entered, once.
  useEffect(() => {
    if (profile && draft === null) {
      setDraft({
        allergies: profile.allergies,
        dietaryRestrictions: profile.dietaryRestrictions,
        dislikedIngredients: profile.dislikedIngredients,
      });
    }
  }, [profile, draft]);

  // household_invite_opened: once per page, when the answer arrives.
  const openedTracked = useRef(false);
  useEffect(() => {
    if (openedTracked.current || !data) return;
    openedTracked.current = true;
    capture('household_invite_opened', { state: data.state, signedIn: true });
  }, [data]);

  const lists = draft ?? original;
  // One automatic retry per tap when the server still reports missing consent.
  const consentRetried = useRef(false);

  const join = trpc.household.join.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      capture('household_joined', { editedSafety: safetyEdited(original, lists) });
      void utils.household.invalidate();
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
      router.push('/meal-plan');
    },
    onError: (err) => {
      // The cached "consented" was stale: refresh it, ask again, retry once.
      if (isHealthConsentRequired(err) && !consentRetried.current) {
        consentRetried.current = true;
        void utils.user.me.invalidate().then(askAndSend);
        return;
      }
      setError(userFacingErrorMessage(err));
    },
  });

  function askAndSend() {
    setError(null);
    setDeclined(false);
    requestHealthConsent(() => join.mutate({ code, ...lists }), {
      hasHealthData:
        lists.allergies.length +
          lists.dietaryRestrictions.length +
          lists.dislikedIngredients.length >
        0,
      // Joining without the terms would wipe the profile's allergies: don't join.
      onDeclined: () => setDeclined(true),
    });
  }

  const onJoin = () => {
    consentRetried.current = false;
    askAndSend();
  };

  if (preview.isLoading) {
    return (
      <Page>
        <h1 className="sr-only">{t('household.sharing.joinPageTitle')}</h1>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </Page>
    );
  }

  // A failed preview (flag off, malformed code, offline) reads like an unknown code.
  if (preview.isError || !data) {
    return <Message body={t('household.sharing.inviteState.NOT_FOUND')} />;
  }

  const message = inviteStateMessage(t, data);
  if (message !== null || !profile) {
    return <Message body={message ?? t('household.sharing.inviteState.NOT_FOUND')} />;
  }

  const ownerName = data.ownerName ?? '';

  return (
    <Page>
      {choice === 'ask' && (
        <div
          className="flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm"
          data-testid="household-open-in-app"
        >
          <h1 className="text-sm font-medium text-gray-900">
            {t('household.sharing.joinTitle', { ownerName })}
          </h1>
          <Button asChild className="min-h-11">
            <a href={appHouseholdJoinUrl(code)}>{t('household.sharing.openInApp')}</a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setChoice('web')}
          >
            {t('household.sharing.continueOnWeb')}
          </Button>
        </div>
      )}
      {choice === 'web' && (
        <section aria-labelledby="household-join-title" className="flex flex-col gap-5">
          <div>
            <h1
              id="household-join-title"
              className="font-serif text-2xl font-bold leading-tight text-gray-900"
            >
              {t('household.sharing.joinTitle', { ownerName })}
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              {t('household.sharing.joinLede', { ownerName, profileName: profile.name })}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {JOIN_SHARES.map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {t(`household.sharing.joinShares.${line}`)}
                </li>
              ))}
            </ul>
            <p className="text-sm font-medium text-gray-900">
              {t('household.sharing.joinPrivate')}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t('household.sharing.joinSafetyTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-600">{t('household.sharing.joinSafetyHint')}</p>
            </div>
            <SafetyTermsEditor value={lists} onChange={setDraft} disabled={join.isPending} />
          </div>

          <div className="space-y-1 text-sm text-gray-700">
            <p>
              {t('household.sharing.joinPortion', {
                portion: householdPortionText(t, profile.portionFactor),
              })}
            </p>
            <p>{t('household.sharing.joinOwnPlansNote')}</p>
          </div>

          {declined && <HealthDeclinedNotice testId="household-join-declined" />}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              className="min-h-11 sm:flex-1"
              loading={join.isPending}
              onClick={onJoin}
            >
              {t('household.sharing.joinAllow')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:flex-1"
              disabled={join.isPending}
              onClick={() => router.push('/dashboard')}
            >
              {t('household.sharing.joinDecline')}
            </Button>
          </div>
        </section>
      )}
      {healthConsentSheet}
    </Page>
  );
}
