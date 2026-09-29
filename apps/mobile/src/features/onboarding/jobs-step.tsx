import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ONBOARDING_JOBS, type OnboardingJob } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { ONBOARDING_COPY } from './copy';

// Step 1 — Jobs (UX-03, T-03.2/T-03.3): multi-select, replaces IntentStep.
// "Pick all that fit." Continue is disabled at 0 selections (AC1); a
// selected card deselects on a second tap (AC1). `Just looking around`
// (handled by the wizard, not here) saves `jobs: ['PLAN_MEALS']` and skips
// straight to Food Today.

export const JOB_OPTIONS: {
  value: OnboardingJob;
  titleKey:
    | 'jobTrainTitle'
    | 'jobPlanMealsTitle'
    | 'jobHouseholdTitle'
    | 'jobUseWhatIHaveTitle'
    | 'jobSavedRecipesTitle'
    | 'jobTrackTitle';
  detailKey:
    | 'jobTrainDetail'
    | 'jobPlanMealsDetail'
    | 'jobHouseholdDetail'
    | 'jobUseWhatIHaveDetail'
    | 'jobSavedRecipesDetail'
    | 'jobTrackDetail';
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'TRAIN',
    titleKey: 'jobTrainTitle',
    detailKey: 'jobTrainDetail',
    icon: 'barbell-outline',
  },
  {
    value: 'PLAN_MEALS',
    titleKey: 'jobPlanMealsTitle',
    detailKey: 'jobPlanMealsDetail',
    icon: 'calendar-outline',
  },
  {
    value: 'HOUSEHOLD',
    titleKey: 'jobHouseholdTitle',
    detailKey: 'jobHouseholdDetail',
    icon: 'people-outline',
  },
  {
    value: 'USE_WHAT_I_HAVE',
    titleKey: 'jobUseWhatIHaveTitle',
    detailKey: 'jobUseWhatIHaveDetail',
    icon: 'basket-outline',
  },
  {
    value: 'SAVED_RECIPES',
    titleKey: 'jobSavedRecipesTitle',
    detailKey: 'jobSavedRecipesDetail',
    icon: 'book-outline',
  },
  {
    value: 'TRACK',
    titleKey: 'jobTrackTitle',
    detailKey: 'jobTrackDetail',
    icon: 'pie-chart-outline',
  },
];

// Keeps JOB_OPTIONS and the shared ONBOARDING_JOBS enum from drifting apart.
const _exhaustive: readonly OnboardingJob[] = JOB_OPTIONS.map((o) => o.value);
if (_exhaustive.length !== ONBOARDING_JOBS.length) {
  throw new Error('jobs-step.tsx: JOB_OPTIONS is missing a job from ONBOARDING_JOBS');
}

export interface JobsStepProps {
  value: OnboardingJob[];
  onChange: (jobs: OnboardingJob[]) => void;
}

export function JobsStep({ value, onChange }: JobsStepProps) {
  function toggle(job: OnboardingJob) {
    onChange(value.includes(job) ? value.filter((j) => j !== job) : [...value, job]);
  }

  return (
    <View className="gap-3">
      <Text variant="muted" className="text-sm">
        {ONBOARDING_COPY.jobsHelper}
      </Text>
      <View className="gap-3">
        {JOB_OPTIONS.map((option) => {
          const selected = value.includes(option.value);
          return (
            <PressableScale
              key={option.value}
              pressScale="card"
              testID={`onboarding-job-${option.value}`}
              accessibilityRole="checkbox"
              accessibilityLabel={`${ONBOARDING_COPY[option.titleKey]}. ${ONBOARDING_COPY[option.detailKey]}`}
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(option.value)}
              className={cn(
                'min-h-11 flex-row items-center gap-4 rounded-xl border-2 p-4',
                selected ? 'border-primary bg-accent' : 'border-border bg-white',
              )}
            >
              <View
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-xl',
                  selected ? 'bg-primary' : 'bg-accent',
                )}
              >
                <Ionicons name={option.icon} size={22} color={selected ? '#ffffff' : '#944a00'} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-semibold text-gray-900">
                  {ONBOARDING_COPY[option.titleKey]}
                </Text>
                <Text variant="muted" className="text-sm">
                  {ONBOARDING_COPY[option.detailKey]}
                </Text>
              </View>
              <View
                className={cn(
                  'h-6 w-6 items-center justify-center rounded-full border-2',
                  selected ? 'border-primary bg-primary' : 'border-border bg-white',
                )}
              >
                {selected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
