import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, NextWorkoutDto } from '@chefer/types';
import {
  EntryCard,
  ListRow,
  ListSection,
  Screen,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { supersetSlot } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { GymBootstrapUnavailable } from '../../gym/components/gym-bootstrap-state';
import { OutboxWaitingCard } from '../../gym/components/outbox-waiting-card';
import { StartConflictSheet } from '../../gym/today/start-conflict-sheet';
import { TargetChangeNotice } from '../../gym/today/target-change-notice';
import { formatTarget } from '../../gym/today/today-helpers';
import { useTrainToday, type TrainToday } from '../../gym/today/use-train-today';
import { libraryLookup } from '../../gym/use-gym-bootstrap';
import { LogWorkoutSheet } from '../log-workout-sheet';
import { ShellTopBar } from '../shell-chrome';
import { PastWorkouts } from './past-workouts';
import { TrainButton } from './train-button';
import {
  DoneTodayCard,
  MissedDayCard,
  NothingPlannedCard,
  OfferCard,
  OngoingWorkoutCard,
  ParkedSessionCards,
  PausedCard,
  RestDayCard,
  routineSubtitle,
  TrainCard,
  UpNextCard,
  WeekCard,
} from './train-cards';

// ─── Train (10 Oct redesign, board "Train") ─────────────────────────────────
// The new shell's training tab, in the owner's order: the workout you left
// (it matters most), this week, what's up next (start, edit, the time you
// have), log one you already did, your routines, past workouts one per line,
// then the weekly screens. The state and every action come from
// `useTrainToday()`, the same hook the old Gym Today renders from.

/** Up next's ⋯: today's exercises (the info the old card listed) and the day actions. */
function UpNextMenu({
  visible,
  onClose,
  onExited,
  workout,
  bootstrap,
  online,
  onPickDay,
  onSkip,
}: {
  visible: boolean;
  onClose: () => void;
  onExited: () => void;
  workout: NextWorkoutDto;
  bootstrap: GymBootstrap;
  online: boolean;
  onPickDay: () => void;
  onSkip: () => void;
}) {
  const colors = useThemeColors();
  const lookup = libraryLookup(bootstrap);
  const unit = bootstrap.profile?.unit ?? 'KG';
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      eyebrow="Up next"
      title={workout.dayName}
      testID="train-up-next-menu"
    >
      <View className="gap-4 pb-4">
        <ListSection footer="Not feeling an exercise? Swap, skip or add one from its ⋯ menu as you go.">
          {workout.exercises.map((ex, i) => {
            const slot = supersetSlot(workout.exercises, i);
            const name = lookup(ex.exerciseId)?.name ?? ex.exerciseId;
            return (
              <ListRow
                key={ex.routineExerciseId}
                testID={`train-up-next-exercise-${ex.routineExerciseId}`}
                title={slot ? `${slot.label}${slot.position + 1} · ${name}` : name}
                subtitle={formatTarget(ex, bootstrap, unit)}
              />
            );
          })}
        </ListSection>
        <ListSection>
          <ListRow
            testID="train-pick-day"
            title="Do another day instead"
            icon={<Icon name="swap" color={colors.brand} />}
            accessory="none"
            onPress={onPickDay}
          />
          <ListRow
            testID="train-skip"
            title="Skip this day"
            subtitle={online ? undefined : 'Needs a connection'}
            icon={<Icon name="skip" color={colors.brand} />}
            accessory="none"
            disabled={!online}
            onPress={onSkip}
          />
        </ListSection>
      </View>
    </Sheet>
  );
}

function DayPickerSheet({ t }: { t: TrainToday }) {
  const colors = useThemeColors();
  return (
    <Sheet
      visible={t.dayPickerVisible}
      onClose={() => t.setDayPickerVisible(false)}
      title="Choose a day"
      testID="train-day-picker"
    >
      <View className="pb-4">
        <ListSection>
          {(t.view?.sortedDays ?? []).map((day) => (
            <ListRow
              key={day.id}
              testID={`train-day-${day.id}`}
              title={day.name}
              icon={<Icon name="barbell" color={colors.brand} />}
              accessory="none"
              onPress={() => t.handlePickDay(day.id)}
            />
          ))}
          <ListRow
            testID="train-day-freestyle"
            title="Freestyle"
            subtitle="Build it as you go"
            icon={<Icon name="add" color={colors.brand} />}
            accessory="none"
            onPress={t.handlePickFreestyle}
          />
        </ListSection>
      </View>
    </Sheet>
  );
}

/** The card for today: paused / done / rest / up next / nothing planned. */
function TodayCard({ t, onOpenMenu }: { t: TrainToday; onOpenMenu: () => void }) {
  const { bootstrap, view } = t;
  if (!bootstrap || !view) return null;
  if (bootstrap.activePause) return <PausedCard t={t} bootstrap={bootstrap} />;
  if (view.status.kind === 'done' && view.doneCard) return <DoneTodayCard t={t} view={view} />;
  if (view.status.kind === 'rest' && view.todays.kind !== 'planned' && view.nextWorkout) {
    return <RestDayCard t={t} view={view} />;
  }
  if (view.nextWorkout && view.short && view.shownWorkout) {
    return <UpNextCard t={t} view={view} onOpenMenu={onOpenMenu} />;
  }
  return <NothingPlannedCard t={t} />;
}

export function TrainScreen() {
  const colors = useThemeColors();
  const t = useTrainToday();
  const { bootstrap, bootstrapLoad, view, activeWorkout } = t;
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // iOS presents one modal at a time: the ⋯ sheet's choice runs once it's gone.
  const afterMenu = useRef<(() => void) | null>(null);

  // UX-GYM-24: a failed first load shows Retry; offline with no cache says so.
  if (!bootstrap || bootstrapLoad.load !== 'data') {
    return (
      <Screen className="bg-canvas px-0">
        <View className="px-4 pt-2">
          <ShellTopBar />
        </View>
        <GymBootstrapUnavailable
          load={bootstrapLoad.load === 'data' ? 'loading' : bootstrapLoad.load}
          onRetry={bootstrapLoad.retry}
          testID="train"
          what="your training"
        />
      </Screen>
    );
  }

  const routines = (
    <EntryCard
      testID="train-routines"
      icon={<Icon name="list" color={colors.onBrand} size={22} />}
      title="Routines"
      subtitle={routineSubtitle(bootstrap)}
      onPress={() => router.push('/training/routine')}
      addLabel="Routine"
      addAccessibilityLabel="New routine"
      addIcon={<Icon name="add" color={colors.brand} size={18} />}
      onAdd={() => router.push('/gym/routines')}
    />
  );

  const links = (
    <ListSection testID="train-links">
      <ListRow
        testID="train-exercises"
        title="Exercises"
        icon={<Icon name="library" color={colors.brand} />}
        onPress={() => router.push('/training/exercises')}
      />
      <ListRow
        testID="train-stats"
        title="Strength and history"
        icon={<Icon name="stats" color={colors.brand} />}
        onPress={() => router.push('/training/stats')}
      />
    </ListSection>
  );

  const logButton = (
    <TrainButton
      testID="train-log-workout"
      label="Log a workout"
      icon="add"
      variant="tinted"
      size="lg"
      onPress={() => setLogOpen(true)}
    />
  );

  const ongoing =
    activeWorkout.isActive && activeWorkout.session ? (
      <OngoingWorkoutCard
        bootstrap={bootstrap}
        session={activeWorkout.session}
        pausedAt={t.pausedAt}
      />
    ) : null;

  let body;
  if (!bootstrap.profile) {
    body = (
      <TrainCard testID="train-empty-setup">
        <Text accessibilityRole="header" className="text-title3 font-bold text-label">
          Set up your training
        </Text>
        <Text className="text-subhead text-label-secondary">
          A 90-second setup gets you a routine and today’s workout.
        </Text>
        <TrainButton
          testID="train-setup-cta"
          label="Set up training"
          onPress={() => router.push('/gym/setup')}
        />
      </TrainCard>
    );
  } else if (!view) {
    // UX-GYM-15: archiving the active routine must not hide the history —
    // logging and past workouts stay (they need no routine).
    body = (
      <>
        {ongoing}
        <TrainCard testID="train-empty-routine">
          <Text accessibilityRole="header" className="text-title3 font-bold text-label">
            No active routine
          </Text>
          <Text className="text-subhead text-label-secondary">
            Pick or build a routine to see today’s workout.
          </Text>
          <TrainButton
            testID="train-routine-cta"
            label="My routines"
            onPress={() => router.push('/gym/routines')}
          />
          <TrainButton
            testID="train-freestyle"
            label="Freestyle workout"
            icon="barbell"
            variant="outline"
            onPress={t.starts.startFreestyle}
          />
        </TrainCard>
        {logButton}
        {routines}
        <PastWorkouts bootstrap={bootstrap} />
        <ParkedSessionCards t={t} />
        <OutboxWaitingCard status={t.outboxStatus} testID="train-outbox" />
        {links}
      </>
    );
  } else {
    body = (
      <>
        {/* UX-44 (T-44.4): targets that moved after a correction synced. */}
        <TargetChangeNotice bootstrap={bootstrap} dataUpdatedAt={t.bootstrapQuery.dataUpdatedAt} />
        {ongoing}
        <WeekCard view={view} today={t.today} />
        <TodayCard t={t} onOpenMenu={() => setMenuOpen(true)} />
        {!bootstrap.activePause && !view.overdueShown ? <MissedDayCard t={t} view={view} /> : null}
        <OfferCard t={t} view={view} />
        {logButton}
        {routines}
        <PastWorkouts bootstrap={bootstrap} />
        {/* UX-GYM-01 / UX-GYM-25: workouts that didn't save, and the waiting queue. */}
        <ParkedSessionCards t={t} />
        <OutboxWaitingCard status={t.outboxStatus} testID="train-outbox" />
        {links}
      </>
    );
  }

  const shown = view?.shownWorkout ?? null;

  return (
    <Screen className="bg-canvas px-0">
      <ScrollView
        testID="train-scroll"
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            testID="train-refresh"
            refreshing={t.manualRefreshing}
            onRefresh={t.handleRefresh}
            tintColor={colors.brand}
          />
        }
      >
        <ShellTopBar />
        {body}
      </ScrollView>

      {activeWorkout.session ? (
        <StartConflictSheet
          visible={t.starts.pendingStart !== null}
          onClose={() => t.starts.setPendingStart(null)}
          session={activeWorkout.session}
          targetName={t.starts.pendingStart?.targetName ?? 'a new workout'}
          onResume={t.starts.handleConflictResume}
          onFinishAndStart={() => void t.starts.handleConflictFinishAndStart()}
          onDiscardAndStart={t.starts.handleConflictDiscardAndStart}
        />
      ) : null}

      {shown ? (
        <UpNextMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          onExited={() => {
            const run = afterMenu.current;
            afterMenu.current = null;
            run?.();
          }}
          workout={shown}
          bootstrap={bootstrap}
          online={t.online}
          onPickDay={() => {
            afterMenu.current = () => t.setDayPickerVisible(true);
            setMenuOpen(false);
          }}
          onSkip={() => {
            setMenuOpen(false);
            t.handleSkip();
          }}
        />
      ) : null}

      <DayPickerSheet t={t} />
      <LogWorkoutSheet visible={logOpen} onClose={() => setLogOpen(false)} />
    </Screen>
  );
}
