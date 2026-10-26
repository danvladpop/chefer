import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import {
  ConfirmSheet,
  ErrorState,
  IconButton,
  Screen,
  Text,
  useQueryState,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../src/components/icon';
import { setMode } from '../../src/features/gym/mode-store';
import { JobsStep } from '../../src/features/onboarding/jobs-step';
import { TrainButton } from '../../src/features/shell/train/train-button';
import { useT } from '../../src/lib/i18n';
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
//
// 11 Oct restyle: the shell's look — canvas, ShellTopBar's brand chevron +
// title1 top bar (drawn here so Back and the title keep their testIDs, and so
// Back stays a plain `router.back()` the unsaved guard intercepts).

export default function SettingsJobsScreen() {
  const { t } = useT();
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const prefsQuery = trpc.preferences.get.useQuery();
  const { data } = prefsQuery;
  const { state: loadState, retry } = useQueryState(prefsQuery);
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
    title: t('settings.jobs.discardTitle'),
    message: t('settings.jobs.discardMessage'),
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
          message: t('settings.jobs.setUpTrainingPrompt'),
          actionLabel: t('settings.jobs.setUp'),
          onAction: () => {
            setMode('gym');
            router.replace('/today');
            router.push('/gym/setup');
          },
        });
        router.back();
      } else if (addedFood) {
        snackbar.show({
          message: t('settings.jobs.setUpFoodPrompt'),
          actionLabel: t('settings.jobs.setUp'),
          onAction: () => router.push('/preferences'),
        });
        router.back();
      } else {
        router.back();
      }
    },
  });

  // UX-X-12: a failed load is not a spinner forever.
  if (loadState === 'error') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="justify-center bg-canvas">
        <ErrorState
          testID="settings-jobs-load-error"
          title={t('settings.jobs.loadError')}
          onRetry={retry}
        />
      </Screen>
    );
  }

  if (jobs === null) {
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center bg-canvas"
      >
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* UX-ACC-05: a back row (Android had no way out but the system gesture). */}
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
        <IconButton
          testID="settings-jobs-back"
          accessibilityLabel={t('common.actions.back')}
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => router.back()}
          className="-ml-2"
        />
        <Text
          testID="settings-jobs-title"
          accessibilityRole="header"
          className="min-w-0 flex-1 text-title1 font-bold text-label"
        >
          {t('settings.jobs.title')}
        </Text>
      </View>
      {/* UX-ACC-05: the six cards scroll — the last one used to sit under Save,
          and at accessibility text sizes three were unreachable. */}
      <ScrollView
        testID="settings-jobs-scroll"
        className="flex-1"
        contentContainerClassName="px-4 pb-4 pt-3"
      >
        <JobsStep value={jobs} onChange={setJobs} />
      </ScrollView>
      <View className="gap-2 border-t border-separator bg-surface px-4 pb-2 pt-3">
        <TrainButton
          testID="settings-jobs-save"
          label={t('common.actions.save')}
          size="lg"
          loading={setJobsMutation.isPending}
          disabled={jobs.length === 0 || setJobsMutation.isPending}
          onPress={() => setJobsMutation.mutate({ jobs })}
        />
      </View>
      <ConfirmSheet testID="settings-jobs-discard" {...guard.sheetProps} />
    </Screen>
  );
}
