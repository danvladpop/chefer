import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Button, PressableScale, Sheet, Text } from '@chefer/ui-mobile';
import {
  ACTIVATION_STEP_COPY,
  activationIntro,
  activationStepKeys,
  type ActivationStepKey,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// Post-upgrade activation (review P-8; audit F-PREM-1-5, F-PM-9) — port of
// web's features/premium/components/PostUpgradeActivation.tsx. After the
// tier flips, "things to do first", led by what the user upgraded for (the
// `source`: the household upsell leads with "Add your table") and never
// sending a user who already has a profile to onboarding. Ordering + copy
// are shared (@chefer/utils premium-activation); only the routes are ours.

const HREFS: Record<ActivationStepKey, Href> = {
  profile: '/onboarding',
  household: '/household',
  regenerate: '/meal-plan',
  cheferize: '/import-recipe',
};

export function PostUpgradeSheet({
  visible,
  onClose,
  source,
}: {
  visible: boolean;
  onClose: () => void;
  /** The upgrade source, e.g. 'household'; null = the default order. */
  source: string | null;
}) {
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: visible,
  });
  // Until hasProfile loads, assume a profile: hiding the goal step for a
  // moment beats offering onboarding to someone who has done it (F-PM-9).
  const steps = activationStepKeys(source, hasProfile ?? true).map(
    (key) => ACTIVATION_STEP_COPY[key],
  );
  const first = steps[0];

  const go = (key: ActivationStepKey) => {
    onClose();
    router.push(HREFS[key]);
  };

  return (
    <Sheet
      testID="post-upgrade"
      visible={visible}
      onClose={onClose}
      eyebrow="Premium unlocked"
      title="You're premium, chef"
      footer={
        first && (
          <Button testID="post-upgrade-primary" onPress={() => go(first.key)}>
            {`${first.title} →`}
          </Button>
        )
      }
    >
      <View className="gap-3 pb-2">
        <Text variant="muted" className="text-sm">
          {activationIntro(steps.length)}
        </Text>
        {steps.map(({ key, title, detail }, i) => (
          <PressableScale
            key={key}
            testID={`post-upgrade-step-${key}`}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${title}. ${detail}`}
            onPress={() => go(key)}
            className="min-h-11 flex-row items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
          >
            <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs font-bold text-primary-foreground">{i + 1}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-gray-900">{title}</Text>
              <Text className="text-xs text-gray-600">{detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}
