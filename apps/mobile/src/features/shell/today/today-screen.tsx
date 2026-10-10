import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';
import { keepPreviousData } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import {
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Skeleton,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { localDateStr } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { trpc } from '../../../lib/trpc';
import { TrainingDayNote } from '../../dashboard/components/training-day-note';
import { useGymReminders } from '../../gym/reminders/use-gym-reminders';
import { useTimedRefresh } from '../../gym/today/use-timed-refresh';
import { NumbersModeProvider, useNumbersMode } from '../../numbers-mode/numbers-mode';
import { HealthConsentTodayNotice } from '../../privacy/health-consent-notice';
import { MigrationCard } from '../../safety/migration-card';
import { RebalanceBanner } from '../../tracker/rebalance-banner';
import { RebalanceOffer } from '../../tracker/rebalance-offer';
import { useSlotActions } from '../../tracker/use-slot-actions';
import { ShellTopBar } from '../shell-chrome';
import { NextMealCard } from './next-meal-card';
import { NutritionCard } from './nutrition-card';
import { BoardCard, SectionTitle } from './parts';
import { yourDaySlots } from './today-helpers';
import { TrainingSection } from './training-card';
import { TodayWeight } from './weight-card';
import { YourDayCard } from './your-day-card';

// ─── Today (10 Oct redesign, boards Home and HomeDone) ──────────────────────
// One screen, one question — what now: the day's intake against the target
// (half-ring gauge and macro rows), the next meal with Eaten / Cook now /
// Swap / Skip, the day's slots with an obvious way into "Your day", today's
// training (planned, or done with its numbers) and the weigh-in, which turns
// into a weight widget once today is logged. Same data as the old Food Today
// (dashboard.summary with the device's day and hour), same gates: a goal-less,
// non-tracking user (showNutrition false) gets no gauge and no weight card,
// protein-only users never see kcal (WP-08), weigh-ins ask for health consent.
// Dropped from this screen with the owner (10 Oct): the weekly review card
// (in Stats now), the "things to buy" nudge, "Later today", Tonight/Tomorrow
// and the "See full day" link (replaced by "Open your day").

function TodaySkeleton() {
  return (
    <View testID="today-loading" accessible accessibilityLabel="Loading today" className="gap-4">
      <Skeleton className="h-72 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-36 w-full rounded-card" />
    </View>
  );
}

export function TodayScreen() {
  const colors = useThemeColors();
  // The device's own day and hour decide "today" and the next meal (F-DASH-1-1);
  // the previous summary stays on screen while a new hour's loads (UX-FOOD-23).
  const {
    data: d,
    isLoading,
    refetch,
  } = trpc.dashboard.summary.useQuery(
    { localDate: localDateStr(), localHour: new Date().getHours() },
    { placeholderData: keepPreviousData },
  );
  // UX-FOOD-13: the pull-to-refresh spinner follows a user pull only.
  const { refreshing, onRefresh } = useTimedRefresh(refetch);
  // Tab screens stay mounted: refetch on tab focus so a plan change elsewhere shows.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  // gym_plan.md §6.5: the old Today workout card hosted the reminder
  // reschedule; Today is still the screen always mounted for a signed-in user.
  useGymReminders();
  const isPremium = useIsPremium();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: isPremium === true,
    staleTime: 60_000,
  });
  const today = localDateStr();
  // WP-06 "Skipped it", with Undo in the snackbar.
  const slotActions = useSlotActions(today);
  // WP-08: Today's own payload decides protein-only, so a cold start never flashes kcal.
  const { proteinOnly } = useNumbersMode(d?.numbersMode);

  const topBar = <ShellTopBar className="mb-1" />;

  if (isLoading) {
    return (
      <Screen className="bg-canvas px-0">
        <View className="gap-4 px-4 pt-3">
          {topBar}
          <TodaySkeleton />
        </View>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen className="bg-canvas px-0">
        <View className="px-4 pt-3">{topBar}</View>
        <ErrorState
          testID="today-load-error"
          title="Couldn't load your day"
          icon={<Icon name="refresh" color={colors.labelTertiary} size={40} />}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  const n = d.nutrition;
  // Lifters on a training day get the bumped targets (audit P2-4, WP-07).
  const target = n.adjustedTargets ?? {
    dailyCalorieTarget: n.dailyCalorieTarget,
    proteinG: n.protein.targetG,
    carbsG: n.carbs.targetG,
    fatG: n.fat.targetG,
  };
  const hasPlan = d.weekPlan.length > 0;
  const slots = yourDaySlots(d);
  const showProfileNudge = d.showNutrition && isPremium === true && hasProfile === false;

  return (
    <NumbersModeProvider mode={d.numbersMode}>
      <Screen className="bg-canvas px-0">
        {/* Keyboard-aware: the weigh-in field and Save stay above the keyboard. */}
        <KeyboardAwareScrollView
          testID="today-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {topBar}

          {/* UX-26 AC2: after "Don't save it", plans aren't checked for allergies. */}
          <HealthConsentTodayNotice />
          {/* T-01.3: the legacy free-text safety review — self-gated. */}
          <MigrationCard />

          {/* PW-5: this week's plan was prepared before the week started. */}
          {d.weekReady && d.today.dayOfWeek === 0 ? (
            <BoardCard testID="today-week-ready" className="gap-0.5 bg-brand-tint">
              <Text className="text-callout font-semibold text-label">Your week is ready</Text>
              <Text className="text-subhead text-label-secondary">
                {d.weekReady.ratedCount > 0
                  ? `Built from ${d.weekReady.ratedCount} dish${d.weekReady.ratedCount === 1 ? '' : 'es'} you rated.`
                  : 'The chef prepared it on Sunday.'}
              </Text>
            </BoardCard>
          ) : null}

          {/* Premium without a profile: one compact line into onboarding. */}
          {showProfileNudge ? (
            <PressableScale
              testID="profile-nudge"
              accessibilityRole="button"
              accessibilityHint="Your goals, body metrics and dietary needs shape your plans"
              onPress={() => router.push('/onboarding')}
              className="min-h-12 flex-row items-center justify-between gap-2 rounded-card bg-brand-tint px-4 py-3"
            >
              <Text className="min-w-0 flex-1 text-callout font-semibold text-brand">
                Complete your profile
              </Text>
              <Icon name="chevronRight" color={colors.brand} size={18} />
            </PressableScale>
          ) : null}

          {/* What you ate vs target (B-31: only with a goal, tracking, or the toggle on). */}
          {d.showNutrition ? (
            <NutritionCard
              testID="today-nutrition"
              eatenKcal={n.eatenKcal}
              targetKcal={target.dailyCalorieTarget}
              protein={{ value: n.protein.eaten, target: target.proteinG }}
              carbs={{ value: n.carbs.eaten, target: target.carbsG }}
              fat={{ value: n.fat.eaten, target: target.fatG }}
              proteinOnly={proteinOnly}
              proteinGuide={d.proteinGuide.label}
              header={
                n.trainingDay ? (
                  <TrainingDayNote
                    t={n.trainingDay}
                    restKcal={n.dailyCalorieTarget}
                    restProteinG={n.protein.targetG}
                    className="mb-0"
                  />
                ) : null
              }
            />
          ) : null}

          <View className="gap-3">
            <SectionTitle>Next meal</SectionTitle>
            {d.nextMeal ? (
              <NextMealCard
                meal={d.nextMeal}
                dayIndex={d.today.dayOfWeek}
                proteinOnly={proteinOnly}
                skipping={slotActions.pending}
                onSkip={slotActions.skipSlot}
              />
            ) : (
              <BoardCard testID="today-no-meal" className="flex-row items-center gap-3">
                <Text className="min-w-0 flex-1 text-callout text-label-secondary">
                  {hasPlan ? "You're all caught up for today." : 'No meals planned yet.'}
                </Text>
                {hasPlan ? null : (
                  <PressableScale
                    testID="today-open-plan"
                    accessibilityRole="link"
                    accessibilityLabel="Open Meals"
                    onPress={() => router.navigate('/plan')}
                    className="min-h-11 justify-center"
                  >
                    <Text className="text-callout font-semibold text-brand">Open Meals</Text>
                  </PressableScale>
                )}
              </BoardCard>
            )}
          </View>

          <YourDayCard slots={slots} proteinOnly={proteinOnly} />

          {/* WP-07: a log here can offer to rebalance the week; Undo follows an Apply. */}
          <RebalanceOffer onApplied={() => void refetch()} />
          <RebalanceBanner onUndone={() => void refetch()} />

          <TrainingSection />

          {/* B-31: weight tracking assumes a goal. */}
          {d.showNutrition ? <TodayWeight /> : null}
        </KeyboardAwareScrollView>
      </Screen>
    </NumbersModeProvider>
  );
}
