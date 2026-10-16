import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Biscuit, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { ONBOARDING_V4_COPY as COPY } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import {
  clearOnboardingV4Welcome,
  readOnboardingV4Welcome,
  type OnboardingV4Welcome,
} from './welcome-card-store';

/**
 * Onboarding V4's last beat (board OnbV4Done): a one-time "You're all set"
 * card on the landing Today, Biscuit winking. Renders nothing unless V4 just
 * finished on this device; dismissing clears it for good.
 */
export function OnboardingV4WelcomeCard() {
  const [welcome, setWelcome] = useState(readOnboardingV4Welcome);
  if (!welcome) return null;
  return <WelcomeCardBody welcome={welcome} onDismissed={() => setWelcome(null)} />;
}

/** Split out so a Today with no card to show makes no query at all. */
function WelcomeCardBody({
  welcome,
  onDismissed,
}: {
  welcome: OnboardingV4Welcome;
  onDismissed: () => void;
}) {
  const c = useThemeColors();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });

  const food = welcome.jobs.some((j) => j !== 'TRAIN');
  const train = welcome.jobs.includes('TRAIN');
  const body = food && train ? COPY.doneBodyBoth : train ? COPY.doneBodyTrain : COPY.doneBodyFood;
  const dismiss = () => {
    clearOnboardingV4Welcome();
    onDismissed();
  };

  return (
    <View
      testID="onb-v4-welcome-card"
      accessibilityRole="summary"
      className="flex-row items-center gap-3 rounded-card bg-brand-tint py-3 pl-3 pr-12"
    >
      <Biscuit loop="allSet" size={84} label={null} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-headline font-semibold text-label">
          {COPY.doneTitle(me?.firstName ?? null)}
        </Text>
        <Text className="text-subhead text-label-secondary">{body}</Text>
      </View>
      <PressableScale
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={COPY.doneDismiss}
        testID="onb-v4-welcome-dismiss"
        className="absolute right-1 top-1 h-11 w-11 items-center justify-center"
      >
        <Ionicons name="close" size={18} color={c.labelSecondary} />
      </PressableScale>
    </View>
  );
}
