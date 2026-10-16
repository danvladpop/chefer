import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingV4 } from '@/features/onboarding-v4/onboarding-v4';
import { OnboardingWizard } from '@/features/onboarding/components/onboarding-wizard';
import {
  EMPTY_WIZARD_DATA,
  savedIntent,
  savedJobs,
  wizardDataFromPreferences,
  type WizardData,
} from '@/features/onboarding/types';
import { createServerClient } from '@/lib/trpc-server';
import type { BodyUnits, OnboardingJob } from '@chefer/types';
import { ErrorState } from '@chefer/ui';

// ─── Onboarding Page ──────────────────────────────────────────────────────────
// Server component — checks if the user already has a profile and redirects
// to /dashboard if so. Otherwise renders the client-side wizard.
// Free users get the 3-step safety flow (allergies & restrictions are free,
// P1-2); premium users get the full 4-step personalisation flow. Both start
// with "What brings you here?" until it has been answered (P2-3).

export default async function OnboardingPage() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie') ?? '';

  // If the API call fails we show an error rather than a blank wizard.
  let isPremium = true;
  let hasProfile = false;
  let initialData: WizardData = EMPTY_WIZARD_DATA;
  let initialIntent: ReturnType<typeof savedIntent> = null;
  let initialJobs: OnboardingJob[] = [];
  let loadFailed = false;
  // Onboarding V4 (flag `onboardingV4`): the short, Biscuit-led setup. Off —
  // or a failed flag read — keeps today's wizard exactly as it was.
  let onboardingV4 = false;
  let savedUnits: BodyUnits | null = null;

  try {
    const client = createServerClient(cookieHeader);
    onboardingV4 = await client.profile.flags
      .query()
      .then((flags) => flags.onboardingV4 === true)
      .catch(() => false);

    const me = await client.user.me.query();
    isPremium = me.planTier === 'PREMIUM' || me.role === 'ADMIN';

    if (isPremium) {
      hasProfile = await client.preferences.hasProfile.query();
    }

    // Pre-fill from what's already saved — a blank wizard used to overwrite
    // saved allergies on Finish (F-ONB-1-1).
    const saved = await client.preferences.get.query();
    initialData = wizardDataFromPreferences(saved);
    // Step 0 is asked once (P2-3): a saved answer skips it.
    initialIntent = savedIntent(saved);
    initialJobs = savedJobs(saved);
    savedUnits = saved.chefProfile?.preferredUnits ?? null;
  } catch {
    // A blank wizard over data we couldn't load would save empty safety
    // lists (F-ONB-1-1): show an error instead.
    loadFailed = true;
    // Swallow API failures and render the wizard (see above). Note that
    // redirect() must stay outside this block — it signals by throwing a
    // NEXT_REDIRECT error that a bare catch would silently discard.
  }

  if (hasProfile) redirect('/dashboard');

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <ErrorState
          title="Couldn't load your setup"
          message="Nothing has been changed. Check your connection and try again."
          retryHref="/onboarding"
        />
      </div>
    );
  }

  if (onboardingV4) {
    return (
      <OnboardingV4
        isPremium={isPremium}
        initialData={initialData}
        initialJobs={initialJobs}
        savedUnits={savedUnits}
      />
    );
  }

  return (
    <OnboardingWizard
      isPremium={isPremium}
      initialData={initialData}
      initialIntent={initialIntent}
      initialJobs={initialJobs}
    />
  );
}
