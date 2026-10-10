import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import {
  IconButton,
  MediaFrame,
  ProgressRing,
  SegmentedControl,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  pauseSummaryLine,
  resumeSummary,
  TIME_TODAY_OPTIONS,
  weekdayDateLabel,
  type ResumeSummary,
} from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';
import { localDate } from '../../gym/offline/ids';
import { useRestRemaining } from '../../gym/rest-timer';
import { weekdayLabel } from '../../gym/routine/weekday';
import { previewLine } from '../../gym/today/time-today-chips';
import {
  formatStreakLine,
  weekStripDayLabel,
  type WeekStripDay,
} from '../../gym/today/today-helpers';
import type { TrainToday, TrainTodayView } from '../../gym/today/use-train-today';
import { libraryLookup } from '../../gym/use-gym-bootstrap';
import { formatClock, supersetsOf } from '../../gym/workout/workout-model';
import { TrainButton } from './train-button';

// The cards of the Train tab (10 Oct redesign, board "Train"). Every state
// the old Gym Today card had — up next, rest day, done for today, paused,
// nothing planned, a missed day, an offer, a workout that didn't save — is
// here in the board's compact form, on the same `useTrainToday()` state.

/** A plain card: surface on the canvas, hairline border, one radius. */
export function TrainCard({
  children,
  className,
  testID,
}: {
  children: ReactNode;
  className?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      className={cn('gap-3 rounded-card border border-separator bg-surface p-4', className)}
    >
      {children}
    </View>
  );
}

/** A small round icon well beside a card's title. */
function IconWell({ name }: { name: IconName }) {
  const colors = useThemeColors();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="h-11 w-11 items-center justify-center rounded-full bg-brand-tint"
    >
      <Icon name={name} color={colors.brand} size={22} />
    </View>
  );
}

function CardHeading({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <IconWell name={icon} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {title}
        </Text>
        {body ? <Text className="text-subhead text-label-secondary">{body}</Text> : null}
      </View>
    </View>
  );
}

// ─── a. The ongoing workout ────────────────────────────────────────────────

function stateWord(summary: ResumeSummary): string {
  if (summary.state === 'paused') return 'saved';
  if (summary.state === 'backfill') return 'logging';
  if (summary.state === 'allLogged') return 'all sets logged';
  return 'in progress';
}

function RestLine() {
  const { remainingSec, state } = useRestRemaining();
  if (!state || remainingSec <= 0) return null;
  return (
    <Text
      testID="train-ongoing-rest"
      accessibilityLabel={`Resting, ${remainingSec} seconds left`}
      className="text-subhead font-semibold text-brand-on"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {`Rest ${formatClock(remainingSec)}`}
    </Text>
  );
}

/**
 * The workout you left (owner note: it matters most, so it comes first). A
 * running workout ticks once a minute; a "Save for later" one reads "saved".
 */
export function OngoingWorkoutCard({
  bootstrap,
  session,
  pausedAt,
}: {
  bootstrap: GymBootstrap;
  session: WorkoutSessionDoc;
  pausedAt: string | null;
}) {
  const colors = useThemeColors();
  const [now, setNow] = useState(() => Date.now());
  const isBackfill = session.localDate !== localDate();
  const running = pausedAt === null && !isBackfill;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [running]);

  const summary = resumeSummary(session, {
    now: new Date(now).toISOString(),
    pausedAt,
    isBackfill,
    supersets: supersetsOf(session, bootstrap),
    lookup: libraryLookup(bootstrap),
  });
  const minutes = Math.round(summary.elapsedSec / 60);
  const exercises = `${summary.exercisesTotal} ${summary.exercisesTotal === 1 ? 'exercise' : 'exercises'}`;
  const meta =
    summary.state === 'backfill'
      ? `${weekdayDateLabel(session.localDate)} · ${exercises}`
      : `${minutes} min · ${exercises}`;
  const title = `${summary.name} · ${stateWord(summary)}`;
  const action = summary.state === 'allLogged' ? 'Finish' : 'Resume';

  return (
    <View testID="train-ongoing" className="flex-row items-center gap-3 rounded-card bg-brand p-4">
      <View
        accessible
        accessibilityLabel={`${title}, ${meta}, ${summary.setsDone} of ${summary.setsTotal} sets`}
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        <Icon name="timer" color={colors.onBrand} size={24} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-headline font-bold text-brand-on">
            {title}
          </Text>
          <Text numberOfLines={1} className="text-subhead text-brand-on">
            {meta}
          </Text>
          <RestLine />
        </View>
      </View>
      <TrainButton
        testID="train-ongoing-resume"
        variant="onBrand"
        pill
        label={action}
        accessibilityLabel={`${action} ${summary.name}`}
        onPress={() => router.push('/gym/workout')}
      />
    </View>
  );
}

// ─── b. This week ──────────────────────────────────────────────────────────

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function DayDot({ day, isToday }: { day: WeekStripDay; isToday: boolean }) {
  const colors = useThemeColors();
  if (day.status === 'done') {
    return (
      <View className="h-7 w-7 items-center justify-center rounded-full bg-brand">
        <Icon name="checkmark" color={colors.onBrand} size={16} />
      </View>
    );
  }
  if (isToday) return <View className="h-7 w-7 rounded-full border-2 border-brand bg-brand-tint" />;
  if (day.status === 'planned') {
    return <View className="h-7 w-7 rounded-full border-2 border-dashed border-brand" />;
  }
  return <View className="h-7 w-7 rounded-full bg-surface-sunken" />;
}

export function WeekCard({ view, today }: { view: TrainTodayView; today: string }) {
  const colors = useThemeColors();
  const { streak, weekGoal, goalMet, ringProgress, firstWeekNote, weekStrip } = view;
  const done = streak.thisWeekSessions;
  // UX-GYM-29: the dots are colour-only, so the strip reads as one sentence.
  const sentence = `This week: ${weekStrip.map((d) => weekStripDayLabel(d, today)).join('; ')}`;
  return (
    <TrainCard testID="train-week" className="gap-4">
      <View className="flex-row items-center gap-3">
        <ProgressRing
          progress={ringProgress}
          size={64}
          strokeWidth={7}
          color={colors.brand}
          trackColor={colors.surfaceSunken}
          testID="train-week-ring"
          accessibilityLabel={`${done} of ${weekGoal} this week`}
        >
          {goalMet ? (
            <Icon name="checkmark" color={colors.brand} size={24} />
          ) : (
            <Text className="text-callout font-bold text-label">{`${done}/${weekGoal}`}</Text>
          )}
        </ProgressRing>
        <View className="min-w-0 flex-1">
          <Text testID="train-week-line" className="text-headline font-bold text-label">
            {goalMet
              ? `Weekly goal met · ${done} ${done === 1 ? 'session' : 'sessions'}`
              : `${done} of ${weekGoal} this week${firstWeekNote}`}
          </Text>
          <Text testID="train-streak" className="text-subhead text-label-secondary">
            {formatStreakLine(streak)}
          </Text>
        </View>
      </View>
      <View
        testID="train-week-strip"
        accessible
        accessibilityLabel={sentence}
        className="flex-row justify-between"
      >
        {weekStrip.map((day, i) => (
          <View
            key={day.localDate}
            testID={`train-week-day-${day.weekday}`}
            className="items-center gap-1.5"
          >
            <Text className="text-caption font-semibold text-label-secondary">
              {WEEKDAY_LETTERS[i]}
            </Text>
            <DayDot day={day} isToday={day.localDate === today} />
          </View>
        ))}
      </View>
    </TrainCard>
  );
}

// ─── c. Up next (and the other states of today's card) ─────────────────────

const FULL = 'full';
const TIME_OPTIONS = [
  ...TIME_TODAY_OPTIONS.map((n) => ({
    value: String(n),
    label: `${n} min`,
    testID: `train-time-${n}`,
  })),
  { value: FULL, label: 'Full', testID: 'train-time-full' },
];

export function UpNextCard({
  t,
  view,
  onOpenMenu,
}: {
  t: TrainToday;
  view: TrainTodayView;
  onOpenMenu: () => void;
}) {
  const colors = useThemeColors();
  const { short, shownWorkout, overdueFrom, activeRoutine } = view;
  if (!short || !shownWorkout) return null;
  const count = shownWorkout.exercises.length;
  return (
    <TrainCard testID="train-up-next">
      <View className="flex-row items-center gap-3">
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <MediaFrame
            illustration={<Icon name="barbell" color={colors.brand} size={30} />}
            size={64}
            square
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-brand">Up next · today</Text>
          <Text
            testID="train-up-next-name"
            accessibilityRole="header"
            numberOfLines={2}
            className="text-title3 font-bold text-label"
          >
            {shownWorkout.dayName}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {`${count} ${count === 1 ? 'exercise' : 'exercises'} · ~${shownWorkout.estimatedMin} min`}
          </Text>
        </View>
        <IconButton
          testID="train-up-next-more"
          accessibilityLabel={`More for ${shownWorkout.dayName}`}
          icon={<Icon name="more" color={colors.labelSecondary} />}
          onPress={onOpenMenu}
        />
      </View>
      {overdueFrom !== undefined ? (
        <Text testID="train-overdue" className="text-caption text-label-secondary">
          {`Planned for ${weekdayLabel(overdueFrom)} — today works just as well.`}
        </Text>
      ) : null}
      {/* T-36.6: the time you have today (owner: keep it on the card). */}
      <SegmentedControl
        testID="train-time"
        accessibilityLabel="Time available today"
        options={TIME_OPTIONS}
        value={t.timeToday === null ? FULL : String(t.timeToday)}
        onChange={(v) => t.handleTimeTodayChange(v === FULL ? null : Number(v))}
      />
      {short.isShort ? (
        <Text testID="train-short-preview" className="text-caption text-label-secondary">
          {previewLine({ minutes: short.minutes, exerciseCount: short.exerciseCount })}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <TrainButton
          testID="train-start"
          label="Start"
          icon="play"
          size="lg"
          accessibilityLabel={`Start ${shownWorkout.dayName}`}
          className="flex-1"
          onPress={() => t.starts.startPlanned(shownWorkout, short.carryOverExerciseIds)}
        />
        <TrainButton
          testID="train-edit"
          label="Edit"
          icon="edit"
          size="lg"
          variant="tinted"
          accessibilityLabel={`Edit ${activeRoutine.name}`}
          accessibilityHint={t.online ? undefined : 'Editing routines needs a connection'}
          disabled={!t.online}
          className="flex-1"
          onPress={() => router.push(`/gym/routine-editor?id=${activeRoutine.id}`)}
        />
      </View>
      <TrainButton
        testID="train-freestyle"
        label="Freestyle workout"
        icon="barbell"
        variant="outline"
        onPress={t.starts.startFreestyle}
      />
    </TrainCard>
  );
}

export function PausedCard({ t, bootstrap }: { t: TrainToday; bootstrap: GymBootstrap }) {
  const pause = bootstrap.activePause;
  if (!pause) return null;
  return (
    <TrainCard testID="train-paused">
      <CardHeading icon="pause" title="Training paused" body={pauseSummaryLine(pause, t.today)} />
      <TrainButton
        testID="train-end-pause"
        label="End pause"
        variant="outline"
        loading={t.pauseEndMutation.isPending}
        onPress={() => t.pauseEndMutation.mutate({ id: pause.id })}
      />
    </TrainCard>
  );
}

export function DoneTodayCard({ t, view }: { t: TrainToday; view: TrainTodayView }) {
  const card = view.doneCard;
  if (!card) return null;
  const prs = card.prCount > 0 ? ` · ${card.prCount} PR${card.prCount > 1 ? 's' : ''}` : '';
  return (
    <TrainCard testID="train-done">
      <CardHeading
        icon="checkmark"
        title={`Done today · ${card.session.name}`}
        body={`${card.durationMin} min · ${card.workingSets} sets${prs}`}
      />
      {card.next ? (
        <Text testID="train-done-next" className="text-caption text-label-secondary">
          {`Next session: ${weekdayLabel(card.next.weekday)} — ${card.next.dayName}`}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <TrainButton
          testID="train-done-summary"
          label="See summary"
          variant="tinted"
          className="flex-1"
          onPress={() =>
            router.push({ pathname: '/gym/summary/[id]', params: { id: card.session.id } })
          }
        />
        <TrainButton
          testID="train-done-pick-day"
          label="Train again"
          variant="outline"
          accessibilityHint="Pick a day or a freestyle workout"
          className="flex-1"
          onPress={() => t.setDayPickerVisible(true)}
        />
      </View>
    </TrainCard>
  );
}

export function RestDayCard({ t, view }: { t: TrainToday; view: TrainTodayView }) {
  const { status, nextWorkout } = view;
  if (status.kind !== 'rest' || !nextWorkout) return null;
  return (
    <TrainCard testID="train-rest">
      <CardHeading
        icon="time"
        title="Rest day"
        body={`Next: ${weekdayLabel(status.weekday)} — ${status.dayName}. Rest counts too.`}
      />
      <TrainButton
        testID="train-rest-start-anyway"
        label={`Start ${status.dayName} anyway`}
        icon="play"
        variant="outline"
        onPress={() => t.starts.startPlanned(nextWorkout)}
      />
      <TrainButton
        testID="train-rest-pick-day"
        label="Pick a day or freestyle"
        variant="ghost"
        onPress={() => t.setDayPickerVisible(true)}
      />
    </TrainCard>
  );
}

export function NothingPlannedCard({ t }: { t: TrainToday }) {
  return (
    <TrainCard testID="train-nothing-planned">
      <CardHeading
        icon="time"
        title="Nothing planned today"
        body="Rest, or start a freestyle session whenever you like."
      />
      <TrainButton
        testID="train-freestyle"
        label="Freestyle workout"
        icon="barbell"
        variant="outline"
        onPress={t.starts.startFreestyle}
      />
    </TrainCard>
  );
}

export function MissedDayCard({ t, view }: { t: TrainToday; view: TrainTodayView }) {
  const { firstMissed, missed, doneToday } = view;
  if (!firstMissed) return null;
  return (
    <TrainCard testID="train-missed">
      <CardHeading
        icon="calendar"
        title="Still time this week"
        body={
          missed.length === 1
            ? `${firstMissed.dayName} hasn’t happened yet.`
            : `${missed.map((d) => d.dayName).join(' and ')} haven’t happened yet.`
        }
      />
      <View className="flex-row gap-2">
        <TrainButton
          testID="train-missed-primary"
          label={doneToday ? 'Make it next' : 'Do it today'}
          variant="tinted"
          className="flex-1"
          disabled={doneToday && !t.online}
          loading={t.setNextDayMutation.isPending}
          onPress={() => t.handleMissedPrimary(firstMissed)}
        />
        <TrainButton
          testID="train-missed-dismiss"
          label="Not this week"
          variant="ghost"
          className="flex-1"
          onPress={() => t.handleMissedDismiss(firstMissed)}
        />
      </View>
    </TrainCard>
  );
}

export function OfferCard({ t, view }: { t: TrainToday; view: TrainTodayView }) {
  const { offer, recapMonth } = view;
  if (!offer) return null;
  return (
    <TrainCard testID="train-offer">
      <CardHeading
        icon={offer.kind === 'deload' ? 'refresh' : offer.kind === 'recap' ? 'stats' : 'arrowUp'}
        title={offer.title}
        body={offer.body}
      />
      <View className="flex-row gap-2">
        {offer.kind === 'deload' ? (
          <TrainButton
            testID="train-offer-accept"
            label="Take it"
            variant="tinted"
            className="flex-1"
            loading={t.startDeloadMutation.isPending}
            onPress={() => t.startDeloadMutation.mutate()}
          />
        ) : null}
        {offer.kind === 'recap' && recapMonth ? (
          <TrainButton
            testID="train-offer-recap"
            label={`See ${recapMonth.name}`}
            variant="tinted"
            className="flex-1"
            onPress={() =>
              router.push({ pathname: '/training/stats', params: { month: recapMonth.month } })
            }
          />
        ) : null}
        <TrainButton
          testID="train-offer-dismiss"
          label="Dismiss"
          variant="ghost"
          className="flex-1"
          onPress={() => t.handleDismissOffer(offer)}
        />
      </View>
    </TrainCard>
  );
}

/** UX-GYM-01: a workout the server rejected says what is wrong and how to fix it. */
export function ParkedSessionCards({ t }: { t: TrainToday }) {
  return (
    <>
      {t.outboxStatus.parked.map((entry) => (
        <TrainCard key={entry.doc.id} testID={`train-parked-${entry.doc.id}`}>
          <Text
            accessibilityRole="header"
            className="text-headline font-semibold text-attention"
          >{`${entry.doc.name} didn't save`}</Text>
          <Text
            testID={`train-parked-${entry.doc.id}-reason`}
            className="text-subhead text-label-secondary"
          >
            {entry.parkedReason}
          </Text>
          <View className="flex-row gap-2">
            {entry.doc.status === 'COMPLETED' ? (
              <TrainButton
                testID={`train-parked-${entry.doc.id}-fix`}
                label="Fix it"
                className="flex-1"
                onPress={() => router.push(`/gym/workout?edit=${entry.doc.id}`)}
              />
            ) : null}
            <TrainButton
              testID={`train-parked-${entry.doc.id}-details`}
              label="Retry or discard"
              variant="outline"
              className="flex-1"
              onPress={() => router.push('/gym/settings')}
            />
          </View>
        </TrainCard>
      ))}
    </>
  );
}

/** Routines entry subtitle: the active routine's name. */
export function routineSubtitle(bootstrap: GymBootstrap): string {
  return bootstrap.activeRoutine?.name ?? 'Pick or build one';
}
