import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import { Button, Screen, Text, useSnackbar } from '@chefer/ui-mobile';
import { setMode } from '../../src/features/gym/mode-store';
import { JobsStep } from '../../src/features/onboarding/jobs-step';
import { trpc } from '../../src/lib/trpc';

// Settings › "What you use Chefer for" (UX-03, T-03.5). Same JobsStep as
// onboarding, as a screen with a Save footer instead of a wizard. Existing
// single intents map on read (server-side effectiveJobs) — a legacy account
// already sees its matching job pre-selected here (AC8).
//
// Adding Train offers "Set up training now" (→ gym setup); adding a food
// job to a previously gym-only user offers "Set up your food" (→
// Preferences, where How you cook / diet / goal live) — a lighter stand-in
// for the onboarding food-only sub-flow the spec describes, which this
// lane didn't have time to build as its own screen (see the final report).

export default function SettingsJobsScreen() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const { data, isLoading } = trpc.preferences.get.useQuery();
  const [jobs, setJobs] = useState<OnboardingJob[] | null>(null);
  const [originalJobs, setOriginalJobs] = useState<OnboardingJob[]>([]);

  useEffect(() => {
    if (data && jobs === null) {
      setJobs(data.jobs);
      setOriginalJobs(data.jobs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, [data]);

  const setJobsMutation = trpc.preferences.setJobs.useMutation({
    onSuccess: () => {
      void utils.preferences.invalidate();
      const addedTrain = jobs?.includes('TRAIN') && !originalJobs.includes('TRAIN');
      const wasGymOnly = originalJobs.length === 1 && originalJobs[0] === 'TRAIN';
      const addedFood = wasGymOnly && (jobs?.some((j) => j !== 'TRAIN') ?? false);
      if (addedTrain) {
        snackbar.show({
          message: 'Set up training now?',
          actionLabel: 'Set up',
          onAction: () => {
            setMode('gym');
            router.replace('/today');
            router.push('/gym/setup');
          },
        });
        router.back();
      } else if (addedFood) {
        snackbar.show({
          message: 'Set up your food — 3 quick questions?',
          actionLabel: 'Set up',
          onAction: () => router.push('/preferences'),
        });
        router.back();
      } else {
        router.back();
      }
    },
  });

  if (isLoading || jobs === null) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="px-4 py-3">
        <Text testID="settings-jobs-title" variant="heading">
          What you use Chefer for
        </Text>
      </View>
      <View className="flex-1 px-4">
        <JobsStep value={jobs} onChange={setJobs} />
      </View>
      <View className="gap-2 border-t border-border px-4 pb-2 pt-3">
        <Button
          testID="settings-jobs-save"
          loading={setJobsMutation.isPending}
          disabled={jobs.length === 0 || setJobsMutation.isPending}
          onPress={() => setJobsMutation.mutate({ jobs })}
        >
          Save
        </Button>
      </View>
    </Screen>
  );
}
