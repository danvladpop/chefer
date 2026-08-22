import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/onboarding-wizard';
import { createServerClient } from '@/lib/trpc-server';

// ─── Onboarding Page ──────────────────────────────────────────────────────────
// Server component — checks if the user already has a profile and redirects
// to /dashboard if so. Otherwise renders the client-side wizard.
// Free users get the 2-step safety flow (allergies & restrictions are free,
// P1-2); premium users get the full 4-step personalisation flow.

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

  if (hasProfile) redirect('/dashboard');

  return <OnboardingWizard isPremium={isPremium} />;
}
