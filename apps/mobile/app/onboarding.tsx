import { OnboardingWizard } from '../src/features/onboarding/onboarding-wizard';

// Thin screen wrapper — see src/features/onboarding/onboarding-wizard.tsx for
// the actual flow (dogfood feedback #9).
export default function OnboardingScreen() {
  return <OnboardingWizard />;
}
