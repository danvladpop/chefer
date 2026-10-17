import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  IconButton,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage, weightUnitForSystem } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import { useShellV2 } from '../../shell/shell-store';
import { TrainButton } from '../../shell/train/train-button';
import { styleOfAnswer, type TrainingStyleAnswerKey } from '../simple/simple-helpers';
import { TrainingStyleCards } from '../simple/training-style-cards';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { SetupWizard } from './setup-wizard';

// Gym setup with "How do you like to train?" first (simple training mode
// §6.1, flag `simpleTraining` only — with the flag off the wizard is exactly
// as before). "I follow a program…" continues into the unchanged wizard, which
// records PROGRESSIVE. The two "Keep it simple" answers ask nothing else:
// `completeSimpleSetup` (no routine), then "You're set" offers My week.

type Phase = 'ask' | 'wizard' | 'done';

export function SetupStyleGate() {
  const { simpleTraining } = useFlags();
  const [phase, setPhase] = useState<Phase>('ask');
  if (!simpleTraining) return <SetupWizard />;
  if (phase === 'wizard') {
    return <SetupWizard trainingStyle="PROGRESSIVE" onExitFirstStep={() => setPhase('ask')} />;
  }
  if (phase === 'done') return <SimpleSetupDone />;
  return (
    <StyleQuestion onProgressive={() => setPhase('wizard')} onSimpleDone={() => setPhase('done')} />
  );
}

function StyleQuestion({
  onProgressive,
  onSimpleDone,
}: {
  onProgressive: () => void;
  onSimpleDone: () => void;
}) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const [answer, setAnswer] = useState<TrainingStyleAnswerKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The same unit the wizard would default to: the saved preference, else kg.
  const prefs = trpc.preferences.get.useQuery();
  const preferred = prefs.data?.chefProfile?.preferredUnits;
  const unit = preferred ? weightUnitForSystem(preferred) : 'KG';

  const completeSimple = trpc.gym.profile.completeSimpleSetup.useMutation({
    meta: { silent: true },
    onSuccess: (bootstrap) => {
      queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
      void utils.preferences.get.invalidate();
      onSimpleDone();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const onContinue = () => {
    if (!answer || completeSimple.isPending) return;
    setError(null);
    if (styleOfAnswer(answer) === 'PROGRESSIVE') onProgressive();
    else completeSimple.mutate({ unit });
  };

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="mx-4 mt-3 min-h-11 flex-row items-center">
        <IconButton
          testID="setup-style-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
          className="-ml-2"
        />
      </View>
      <KeyboardAwareScrollView
        testID="setup-style"
        contentContainerClassName="gap-5 px-4 py-4"
        footer={
          <View className="gap-2 border-t border-separator bg-surface px-4 pb-2 pt-3">
            {error ? (
              <Text
                testID="setup-style-error"
                accessibilityLiveRegion="polite"
                className="text-center text-subhead text-label"
              >
                {error}
              </Text>
            ) : null}
            <TrainButton
              testID="setup-style-continue"
              label="Continue"
              size="lg"
              disabled={answer === null}
              loading={completeSimple.isPending}
              onPress={onContinue}
            />
          </View>
        }
      >
        <View className="gap-1.5">
          <Text
            testID="gym-setup-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
          >
            How do you like to train?
          </Text>
          <Text className="text-body text-label-secondary">
            You can switch any time in Training settings.
          </Text>
        </View>
        <TrainingStyleCards value={answer} onChange={setAnswer} testIDPrefix="setup-style" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function SimpleSetupDone() {
  const shellV2 = useShellV2();
  return (
    <Screen className="bg-canvas px-4" edges={['top', 'bottom', 'left', 'right']}>
      <View testID="setup-simple-done" className="flex-1 justify-center gap-6">
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-title1 font-bold text-label">
            You’re set
          </Text>
          <Text className="text-body text-label-secondary">
            Want to plan your week? You can do it later.
          </Text>
        </View>
        <View className="gap-2">
          <TrainButton
            testID="setup-plan-week"
            label="Plan my week"
            icon="calendar"
            size="lg"
            onPress={() => router.replace('/gym/my-week')}
          />
          <TrainButton
            testID="setup-later"
            label="Later"
            variant="ghost"
            onPress={() => router.replace(shellV2 ? '/train' : '/today')}
          />
        </View>
      </View>
    </Screen>
  );
}
