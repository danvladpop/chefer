import { useEffect } from 'react';
import { View } from 'react-native';
import { clearPendingOnboarding } from '../src/features/auth/pending-onboarding';
import { OnboardingV4 } from '../src/features/onboarding-v4/onboarding-v4';
import { useOnboardingV4Flag } from '../src/features/onboarding-v4/use-onboarding-v4-flag';
import { OnboardingWizard } from '../src/features/onboarding/onboarding-wizard';

// Thin screen wrapper — see src/features/onboarding/onboarding-wizard.tsx for
// the V3 flow (dogfood feedback #9) and src/features/onboarding-v4/ for the
// short V4 one behind the `onboardingV4` flag.
export default function OnboardingScreen() {
  const v4 = useOnboardingV4Flag();
  // R-18b: arrived — the post-registration redirect (Food tab layout) is done.
  useEffect(() => {
    clearPendingOnboarding();
  }, []);
  if (v4 === 'loading') return <View className="flex-1 bg-canvas" />;
  return v4 === 'on' ? <OnboardingV4 /> : <OnboardingWizard />;
}
