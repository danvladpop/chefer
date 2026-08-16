import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/onboarding-wizard';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { createServerClient } from '@/lib/trpc-server';

// ─── Onboarding Page ──────────────────────────────────────────────────────────
// Server component — checks if the user already has a profile and redirects
// to /dashboard if so. Otherwise renders the client-side wizard.
// Profile setup is a premium feature — free users see the upgrade panel.

export default async function OnboardingPage() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie') ?? '';

  // Defaults are the fall-through state: if the API call fails (network error,
  // etc.) we let the wizard render — the worst case is the user goes through
  // onboarding again (idempotent upsert).
  let isPremium = true;
  let hasProfile = false;

  try {
    const client = createServerClient(cookieHeader);

    const me = await client.user.me.query();
    isPremium = me.planTier === 'PREMIUM' || me.role === 'ADMIN';

    if (isPremium) {
      hasProfile = await client.preferences.hasProfile.query();
    }
  } catch {
    // Swallow API failures and render the wizard (see above). Note that
    // redirect() must stay outside this block — it signals by throwing a
    // NEXT_REDIRECT error that a bare catch would silently discard.
  }

  if (!isPremium) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <UpgradeCard
          title="Profile setup is a premium feature"
          description="Tell the AI chef about your goals, body metrics and dietary needs, and get personalised weekly plans. On the free plan you can generate chef-curated generic plans right away — no setup needed."
        />
      </div>
    );
  }

  if (hasProfile) redirect('/dashboard');

  return <OnboardingWizard />;
}
