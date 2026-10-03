import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import { Button, ConfirmSheet, Screen, Text, useSnackbar } from '@chefer/ui-mobile';
import { setMode } from '../../src/features/gym/mode-store';
import { JobsStep } from '../../src/features/onboarding/jobs-step';
import { trpc } from '../../src/lib/trpc';
import { useUnsavedGuard } from '../../src/lib/use-unsaved-guard';

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

  // UX-ACC-05: leaving with changed selections (← button, iOS swipe, Android
  // BACK) asks first; a successful save lifts the guard before it navigates.
  const dirty =
    jobs !== null &&
    (jobs.length !== originalJobs.length || jobs.some((job) => !originalJobs.includes(job)));
  const guard = useUnsavedGuard(dirty, {
    title: 'Discard your changes?',
    message: 'Your selections have not been saved.',
  });

  const setJobsMutation = trpc.preferences.setJobs.useMutation({
    onSuccess: () => {
      guard.release();
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
      {/* UX-ACC-05: a back row (Android had no way out but the system gesture). */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          testID="settings-jobs-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="settings-jobs-title" variant="heading" className="min-w-0 flex-1">
          What you use Chefer for
        </Text>
      </View>
      {/* UX-ACC-05: the six cards scroll — the last one used to sit under Save,
          and at accessibility text sizes three were unreachable. */}
      <ScrollView
        testID="settings-jobs-scroll"
        className="flex-1"
        contentContainerClassName="px-4 pb-4"
      >
        <JobsStep value={jobs} onChange={setJobs} />
      </ScrollView>
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
      <ConfirmSheet testID="settings-jobs-discard" {...guard.sheetProps} />
    </Screen>
  );
}
