import { useEffect } from 'react';
import { clearPendingOnboarding } from '../src/features/auth/pending-onboarding';
import { OnboardingWizard } from '../src/features/onboarding/onboarding-wizard';

// Thin screen wrapper — see src/features/onboarding/onboarding-wizard.tsx for
// the actual flow (dogfood feedback #9).
export default function OnboardingScreen() {
  // R-18b: arrived — the post-registration redirect (Food tab layout) is done.
  useEffect(() => {
    clearPendingOnboarding();
  }, []);
  return <OnboardingWizard />;
}
