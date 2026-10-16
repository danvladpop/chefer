import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import { bodyMetricsAgeError, isPlausibleHeightCm, isPlausibleWeightKg } from '@chefer/types';
import { ConfirmSheet, Sheet, Text } from '@chefer/ui-mobile';
import {
  activityFromTrainingDays,
  aiConsentRequiredFor,
  computeCalorieTarget,
  ONBOARDING_V4_COPY as COPY,
  defaultsForRegion,
  detectRegion,
  eatsEverything,
  EMPTY_SAFETY_VALUE,
  heightCmFromText,
  ONBOARDING_V4_GOAL_TILES,
  onboardingV4Progress,
  onboardingV4ResumeStep,
  onboardingV4Steps,
  parseBodyNumber,
  planMealMacros,
  premiumJobFor,
  programDaysFromWeekdays,
  toggleQuickSafety,
  userFacingErrorMessage,
  weightKgFromText,
  type OnboardingV4ActivityLevel,
  type OnboardingV4Step,
  type SafetyPickerValue,
} from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { track } from '../../lib/analytics';
import { trackOnboardingCompleted, trackPlanGenerated } from '../../lib/analytics-events';
import { getToken } from '../../lib/auth-store';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { setMode } from '../gym/mode-store';
import { gymBootstrapQueryKey } from '../gym/use-gym-bootstrap';
import { clearOnboardingDraft } from '../onboarding/onboarding-draft';
import { markOnboardingGateHandled } from '../onboarding/onboarding-gate';
import { ACTIVITY_OPTIONS } from '../preferences/types';
import { useHealthConsent } from '../privacy/use-health-consent';
import { SafetyPicker } from '../safety/safety-picker';
import {
  clearOnboardingV4Draft,
  readOnboardingV4Draft,
  writeOnboardingV4Draft,
  type OnboardingV4DraftAnswers,
} from './draft-store';
import {
  AboutYouStep,
  BuildingStep,
  GoalStep,
  JobsStep,
  PremiumStep,
  ReadyStep,
  SafetyStep,
  TrainStep,
  type AboutYouValue,
} from './v4-steps';
import { V4Chip, V4Ghost, V4Primary, V4Screen, V4TopBar } from './v4-ui';
import { markOnboardingV4Welcome } from './welcome-card-store';

// Onboarding V4 (flag `onboardingV4`; boards: canvas page "Onboarding V4 —
// proposal"; review: docs/onboarding-review-2026-10). The short, Biscuit-led
// setup: jobs → goal → about you → [can't eat] → [building → ready] →
// [premium] → [training], then Today with a one-time welcome card. It saves
// through the same free-tier procedures as the V3 wizard, behind the same
// health and AI consent guards; everything with a sensible default (meal
// shape, cooking time, currency, units, run days, nudges) is NOT asked.

type Plan = RouterOutputs['mealPlan']['generate'];
type Experience = 'BEGINNER' | 'INTERMEDIATE';
type Equipment = 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT';

const EMPTY_ABOUT: AboutYouValue = {
  sex: null,
  age: '',
  height: '',
  heightInches: '',
  weight: '',
  trainingWeekdays: [],
};

export function OnboardingV4() {
  const premiumTier = useIsPremium() === true;
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const requestAiConsent = useAiConsent();
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const region = useMemo(() => defaultsForRegion(detectRegion()), []);
  const imperial = region.preferredUnits === 'IMPERIAL';

  // UX-ONB-01: a killed app or "Leave for now" resumes from the saved draft.
  const [draft] = useState(() => readOnboardingV4Draft(getToken()));
  // Premium decided once, at the start: turning it on mid-flow must not drop
  // the step the user is looking at.
  const [startedPremium] = useState(draft?.startedPremium ?? premiumTier);
  const [jobs, setJobs] = useState<OnboardingJob[]>(draft?.jobs ?? []);
  const steps = useMemo(
    () => onboardingV4Steps({ jobs, isPremium: startedPremium }),
    [jobs, startedPremium],
  );
  const [resumeStep] = useState(() =>
    draft ? onboardingV4ResumeStep(draft.step, steps, draft.planBuilt) : 'jobs',
  );
  const [step, setStep] = useState<OnboardingV4Step>(resumeStep ?? 'jobs');
  const [goalChoice, setGoalChoice] = useState<number | null>(draft?.goalChoice ?? null);
  const [about, setAbout] = useState<AboutYouValue>(draft?.about ?? EMPTY_ABOUT);
  const [activityOverride, setActivityOverride] = useState<OnboardingV4ActivityLevel | null>(
    draft?.activityOverride ?? null,
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [safety, setSafety] = useState<SafetyPickerValue>(draft?.safety ?? EMPTY_SAFETY_VALUE);
  const [moreOpen, setMoreOpen] = useState(false);
  const [healthDeclined, setHealthDeclined] = useState(draft?.healthDeclined ?? false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planBuilt, setPlanBuilt] = useState(draft?.planBuilt ?? false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [buildAttempt, setBuildAttempt] = useState(0);
  const [premiumOn, setPremiumOn] = useState(draft?.premiumOn ?? false);
  const [premiumError, setPremiumError] = useState<string | null>(null);
  const [experience, setExperience] = useState<Experience>(draft?.experience ?? 'BEGINNER');
  const [equipment, setEquipment] = useState<Equipment>(draft?.equipment ?? 'FULL_GYM');
  const [programIndex, setProgramIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const finished = useRef(false);

  const hasTrain = jobs.includes('TRAIN');
  const goal = goalChoice === null ? null : (ONBOARDING_V4_GOAL_TILES[goalChoice]?.goal ?? null);
  const activity =
    activityOverride ?? activityFromTrainingDays(hasTrain ? about.trainingWeekdays.length : null);

  // ─── Body maths (same helpers and plausibility bounds as the V3 wizard) ───
  const units = region.preferredUnits;
  const age = parseBodyNumber(about.age);
  const heightCm = heightCmFromText(about.height, about.heightInches, units);
  const weightKg = weightKgFromText(about.weight, units);
  const basics = {
    ...(goal !== null && { goal }),
    ...(about.sex !== null && { biologicalSex: about.sex }),
    ...(age !== null && bodyMetricsAgeError(age) === null && { age }),
    ...(heightCm !== null && isPlausibleHeightCm(heightCm) && { heightCm }),
    ...(weightKg !== null && isPlausibleWeightKg(weightKg) && { weightKg }),
    activityLevel: activity,
  };
  const targetKcal =
    basics.age !== undefined && basics.heightCm !== undefined && basics.weightKg !== undefined
      ? computeCalorieTarget(
          basics.weightKg,
          basics.heightCm,
          basics.age,
          activity,
          about.sex,
          goal,
        )
      : null;

  // ─── Saves ───────────────────────────────────────────────────────────────
  const silent = { meta: { silent: true } } as const;
  const setJobsMutation = trpc.preferences.setJobs.useMutation(silent);
  const setDisplayPrefs = trpc.preferences.setDisplayPreferences.useMutation(silent);
  const profileBasics = trpc.preferences.saveProfileBasics.useMutation(silent);
  const safetyMutation = trpc.preferences.updateSafety.useMutation(silent);
  const generateMutation = trpc.mealPlan.generate.useMutation({
    onSuccess: (data) => trackPlanGenerated(data, 0),
    onSettled: () => {
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.shoppingList.invalidate();
    },
  });
  const upgrade = trpc.user.upgradePlan.useMutation({
    ...silent,
    onSuccess: () => {
      track('upgrade_completed', { source: 'onboarding', job: premiumJobFor('onboarding', jobs) });
      setPremiumOn(true);
      void utils.invalidate();
    },
    onError: () => setPremiumError(COPY.premiumFailed),
  });
  const recommendInput = {
    days: programDaysFromWeekdays(about.trainingWeekdays),
    experience,
    equipmentAccess: equipment,
  };
  const recommend = trpc.gym.profile.recommend.useQuery(recommendInput, {
    enabled: step === 'train',
    staleTime: Infinity,
    retry: false,
  });
  const completeSetup = trpc.gym.profile.completeSetup.useMutation({
    ...silent,
    onSuccess: (bootstrap) => {
      queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
      void utils.preferences.get.invalidate();
      finish();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const shoppingList = trpc.shoppingList.getForWeek.useQuery(
    { weekOffset: 0 },
    { enabled: step === 'ready', staleTime: 60_000 },
  );

  useEffect(() => markOnboardingGateHandled(getToken()), []);

  // Save every answer as it changes; the draft's existence is what resumes setup.
  const draftAnswers: OnboardingV4DraftAnswers = {
    step,
    jobs,
    startedPremium,
    goalChoice,
    about,
    activityOverride,
    safety,
    healthDeclined,
    planBuilt,
    premiumOn,
    experience,
    equipment,
  };
  const draftJson = JSON.stringify(draftAnswers);
  useEffect(() => {
    if (!finished.current) writeOnboardingV4Draft(getToken(), draftAnswers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftJson is the value
  }, [draftJson]);

  // ─── Navigation ──────────────────────────────────────────────────────────
  const index = steps.indexOf(step);
  function next() {
    setError(null);
    const following = steps[index + 1];
    if (following) setStep(following);
    else finish();
  }
  function back() {
    setError(null);
    if (step === 'building') return; // nothing to go back to mid-build
    if (index > 0) setStep(steps[index - 1] ?? 'jobs');
    else setLeaveOpen(true);
  }
  const backRef = useRef(back);
  backRef.current = back;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  function finish() {
    if (finished.current) return;
    finished.current = true;
    trackOnboardingCompleted(jobs, []);
    clearOnboardingDraft();
    clearOnboardingV4Draft();
    markOnboardingGateHandled(getToken());
    markOnboardingV4Welcome(jobs);
    void utils.preferences.invalidate();
    void utils.dashboard.invalidate();
    if (hasTrain && !jobs.some((j) => j !== 'TRAIN')) {
      setMode('gym');
      router.replace('/today');
      return;
    }
    router.replace('/(food)');
  }

  // A resumed draft with nothing left to ask (the plan was built and no step
  // follows the reveal) goes straight to Today.
  useEffect(() => {
    if (resumeStep === null) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function run(task: () => Promise<unknown>) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await task();
      next();
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function continueJobs() {
    void run(() => setJobsMutation.mutateAsync({ jobs }));
  }

  /** About you: units/currency defaults always; goal + body behind the health consent. */
  function continueAbout() {
    const saveCore = () =>
      Promise.all([
        setJobsMutation.mutateAsync({
          jobs,
          ...(hasTrain &&
            about.trainingWeekdays.length > 0 && { trainingWeekdays: about.trainingWeekdays }),
        }),
        setDisplayPrefs.mutateAsync({
          preferredUnits: region.preferredUnits,
          currency: region.currency,
        }),
      ]);
    requestHealthConsent(
      () =>
        void run(async () => {
          await saveCore();
          await profileBasics.mutateAsync(basics);
        }),
      {
        hasHealthData: true,
        onDeclined: () => {
          setHealthDeclined(true);
          void run(saveCore);
        },
      },
    );
  }

  function continueSafety() {
    if (eatsEverything(safety) || healthDeclined) {
      next();
      return;
    }
    requestHealthConsent(() => void run(() => safetyMutation.mutateAsync(safety)), {
      hasHealthData: true,
      onDeclined: () => {
        setHealthDeclined(true);
        next();
      },
    });
  }

  // Building: generate as soon as the step shows; the reveal waits for it.
  useEffect(() => {
    if (step !== 'building') return;
    setBuildError(null);
    setShowSkip(false);
    const skipTimer = setTimeout(() => setShowSkip(true), 8000);
    const build = () => {
      generateMutation
        .mutateAsync({ weekOffset: 0 })
        .then((data) => {
          setPlan(data);
          setPlanBuilt(true);
          setStep('ready');
        })
        .catch((err: unknown) => setBuildError(userFacingErrorMessage(err)));
    };
    requestAiConsent('meal-plan', build, {
      usesAi: aiConsentRequiredFor('meal-plan', startedPremium),
    });
    return () => clearTimeout(skipTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival on the step (or retry)
  }, [step, buildAttempt]);

  /** No week (failed or skipped): straight past the reveal. */
  function skipBuild() {
    const after = steps[steps.indexOf('ready') + 1];
    if (after) setStep(after);
    else finish();
  }

  const dinners = useMemo(() => {
    if (!plan) return [];
    return plan.days
      .map((day) => {
        const dinner =
          day.meals.find((m) => m.type === 'dinner') ?? day.meals[day.meals.length - 1];
        if (!dinner) return null;
        const kcal = planMealMacros(dinner.recipe.nutritionInfo, dinner.portion).kcal || null;
        return { day: day.dayOfWeek, name: dinner.recipe.name, kcal };
      })
      .filter((d): d is { day: number; name: string; kcal: number | null } => d !== null);
  }, [plan]);

  // Training: recommended program first, then the alternatives ("Change").
  const programs = recommend.data
    ? [
        { key: recommend.data.recommendedKey, name: recommend.data.preview.name },
        ...recommend.data.alternatives.map((a) => ({ key: a.key, name: a.name })),
      ]
    : [];
  const program = programs.length > 0 ? programs[programIndex % programs.length] : undefined;
  useEffect(() => setProgramIndex(0), [experience, equipment]);

  function startTraining() {
    if (!program || completeSetup.isPending) return;
    completeSetup.mutate({
      days: recommendInput.days,
      experience,
      equipmentAccess: equipment,
      unit: imperial ? 'LB' : 'KG',
      templateKey: program.key,
      plannedWeekdays: about.trainingWeekdays,
      reminderTime: null,
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const progress = onboardingV4Progress(step, steps);
  const showBack = step !== 'building' && step !== 'ready' && !(step === 'premium' && premiumOn);
  const top = <V4TopBar {...(showBack && { onBack: back })} progress={progress} />;
  const errorLine = error ? (
    <Text
      className="text-center text-subhead text-destructive"
      testID="onb-v4-error"
      accessibilityLiveRegion="polite"
    >
      {error}
    </Text>
  ) : null;

  let body: ReactNode = null;
  let footer: ReactNode = null;
  switch (step) {
    case 'jobs':
      body = (
        <JobsStep
          jobs={jobs}
          onToggle={(job) =>
            setJobs((js) => (js.includes(job) ? js.filter((j) => j !== job) : [...js, job]))
          }
        />
      );
      footer = (
        <V4Primary
          label={COPY.continue}
          onPress={continueJobs}
          disabled={jobs.length === 0}
          loading={saving}
          testID="onb-v4-continue"
        />
      );
      break;
    case 'goal':
      body = <GoalStep choice={goalChoice} onChoose={setGoalChoice} />;
      footer = (
        <V4Primary
          label={COPY.continue}
          onPress={next}
          disabled={goalChoice === null}
          testID="onb-v4-continue"
        />
      );
      break;
    case 'aboutYou':
      body = (
        <AboutYouStep
          value={about}
          onChange={setAbout}
          imperial={imperial}
          showTraining={hasTrain}
          targetKcal={goal === null ? null : targetKcal}
          onChangeTarget={() => setActivityOpen(true)}
        />
      );
      footer = (
        <V4Primary
          label={COPY.continue}
          onPress={continueAbout}
          loading={saving}
          testID="onb-v4-continue"
        />
      );
      break;
    case 'safety':
      body = (
        <SafetyStep
          value={safety}
          onToggleQuick={(key) => setSafety((s) => toggleQuickSafety(s, key))}
          onEverything={() => setSafety(EMPTY_SAFETY_VALUE)}
          onMore={() => setMoreOpen(true)}
        />
      );
      footer = (
        <V4Primary
          label={steps.includes('building') ? COPY.safetyBuild : COPY.safetyContinue}
          icon={steps.includes('building') ? 'sparkles' : undefined}
          onPress={continueSafety}
          loading={saving}
          testID="onb-v4-continue"
        />
      );
      break;
    case 'building':
      body = <BuildingStep kcal={targetKcal} failed={buildError} />;
      footer =
        buildError || showSkip ? (
          <>
            {buildError ? (
              <V4Primary
                label={COPY.buildingRetry}
                onPress={() => setBuildAttempt((n) => n + 1)}
                testID="onb-v4-build-retry"
              />
            ) : null}
            <V4Ghost label={COPY.buildingSkip} onPress={skipBuild} testID="onb-v4-build-skip" />
          </>
        ) : null;
      break;
    case 'ready':
      body = (
        <ReadyStep
          dinners={dinners}
          listCount={shoppingList.data?.items.length ?? null}
          onOpenList={next}
        />
      );
      footer = (
        <>
          <V4Primary label={COPY.readyContinue} onPress={next} testID="onb-v4-continue" />
          <V4Ghost label={COPY.readyLater} onPress={next} />
        </>
      );
      break;
    case 'premium':
      body = <PremiumStep on={premiumOn} error={premiumError} />;
      footer = premiumOn ? (
        <V4Primary label={COPY.continue} onPress={next} testID="onb-v4-continue" />
      ) : (
        <>
          <V4Primary
            label={COPY.premiumTurnOn}
            onPress={() => {
              setPremiumError(null);
              track('upgrade_clicked', {
                source: 'onboarding',
                job: premiumJobFor('onboarding', jobs),
              });
              upgrade.mutate();
            }}
            loading={upgrade.isPending}
            testID="onb-v4-premium-on"
          />
          <V4Ghost label={COPY.premiumLater} onPress={next} testID="onb-v4-premium-later" />
        </>
      );
      break;
    case 'train':
      body = (
        <TrainStep
          experience={experience}
          onExperience={setExperience}
          equipment={equipment}
          onEquipment={setEquipment}
          program={program ? { name: program.name, days: recommendInput.days } : null}
          onChangeProgram={programs.length > 1 ? () => setProgramIndex((i) => i + 1) : null}
        />
      );
      footer = (
        <V4Primary
          label={COPY.trainStart}
          onPress={startTraining}
          loading={completeSetup.isPending}
          disabled={!program}
          testID="onb-v4-train-start"
        />
      );
      break;
  }

  const centred = step === 'building' || (step === 'premium' && premiumOn);
  return (
    <>
      <V4Screen
        top={top}
        center={centred}
        testID={`onb-v4-${step}`}
        footer={
          footer ? (
            <>
              {errorLine}
              {footer}
            </>
          ) : (
            errorLine
          )
        }
      >
        {body}
      </V4Screen>

      <Sheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={COPY.safetyMore}
        testID="onb-v4-more-sheet"
      >
        <View className="gap-3 pb-2">
          <SafetyPicker value={safety} onChange={setSafety} testIDPrefix="onb-v4-more" />
          <V4Primary
            label={COPY.continue}
            onPress={() => setMoreOpen(false)}
            testID="onb-v4-more-done"
          />
        </View>
      </Sheet>

      <Sheet
        visible={activityOpen}
        onClose={() => setActivityOpen(false)}
        title={COPY.aboutActivityTitle}
        testID="onb-v4-activity-sheet"
      >
        <View className="flex-row flex-wrap gap-2 pb-2">
          {ACTIVITY_OPTIONS.map((o) => (
            <V4Chip
              key={o.value}
              label={o.label}
              selected={o.value === activity}
              onPress={() => {
                setActivityOverride(o.value);
                setActivityOpen(false);
              }}
              testID={`onb-v4-activity-${o.value}`}
            />
          ))}
        </View>
      </Sheet>

      <ConfirmSheet
        testID="onb-v4-leave"
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={COPY.leaveTitle}
        body={COPY.leaveBody}
        confirmLabel={COPY.leaveConfirm}
        cancelLabel={COPY.leaveCancel}
        onConfirm={() => {
          setLeaveOpen(false);
          markOnboardingGateHandled(getToken());
          router.replace('/(food)');
        }}
      />
      {healthConsentSheet}
    </>
  );
}
