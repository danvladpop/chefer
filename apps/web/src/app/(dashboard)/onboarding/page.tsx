import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/onboarding-wizard';
import { createServerClient } from '@/lib/trpc-server';

// ─── Onboarding Page ──────────────────────────────────────────────────────────
// Server component — checks if the user already has a profile and redirects
// to /dashboard if so. Otherwise renders the client-side wizard.

export default async function OnboardingPage() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie') ?? '';

  try {
    const client = createServerClient(cookieHeader);
    const hasProfile = await client.preferences.hasProfile.query();
    if (hasProfile) redirect('/dashboard');
  } catch {
    // If the API call fails (network error, etc.) let the wizard render —
    // the worst case is the user goes through onboarding again (idempotent upsert).
  }

  return <OnboardingWizard />;
}
