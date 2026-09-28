import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { Button, Card, ProgressBar, Text } from '@chefer/ui-mobile';
import { resumeSummary, weekdayDateLabel, type ResumeSummary } from '@chefer/utils';
import { localDate } from '../offline/ids';
import { libraryLookup } from '../use-gym-bootstrap';
import { ElapsedTime } from '../workout/rest-timer-bar';
import { formatClock, supersetsOf } from '../workout/workout-model';

// UX-36 amendment A1 (T-36.A1.1, O-09): the Resume card, replacing the old
// "Resume workout / [Resume]" banner. Built entirely on `resumeSummary()` —
// the same pure function the logger derives its own header from — so the
// card and the logger can never disagree (AC9). ≤ 4 text lines at 1.0× on a
// 375 pt screen (AC11): eyebrow+time, name, progress bar + counts, focus.

/** Local calendar-day label for a "Keeps until" instant: "today" / "tomorrow" / a weekday. */
function keepsUntilDayLabel(keepsUntilIso: string): string {
  const today = localDate();
  const keepsDate = localDate(new Date(keepsUntilIso));
  if (keepsDate === today) return 'today';
  const diffMs = Date.parse(`${keepsDate}T00:00:00`) - Date.parse(`${today}T00:00:00`);
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return 'tomorrow';
  return weekdayDateLabel(keepsDate);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function focusLine(summary: ResumeSummary, verb: 'Now' | 'Next'): string | null {
  if (!summary.focus) return null;
  if (summary.focus.isTimer) return `${verb}: ${summary.focus.name}`;
  return `${verb}: ${summary.focus.name} · set ${summary.focus.setIndex} of ${summary.focus.setCount}`;
}

/** The one-sentence accessible label for the whole informational block (A11y). */
function accessibleSentence(summary: ResumeSummary): string {
  const parts = [
    summary.state === 'paused' ? 'Workout paused' : 'Workout in progress',
    summary.name,
    summary.state === 'active'
      ? formatClock(summary.elapsedSec)
      : `${Math.round(summary.elapsedSec / 60)} minutes`,
    `${summary.exercisesDone} of ${summary.exercisesTotal} exercises done`,
    summary.focus
      ? `${summary.state === 'paused' ? 'next' : 'now'} ${summary.focus.name}${summary.focus.isTimer ? '' : ` set ${summary.focus.setIndex} of ${summary.focus.setCount}`}`
      : summary.state === 'allLogged'
        ? 'all sets logged'
        : '',
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

export interface ResumeCardProps {
  bootstrap: GymBootstrap;
  session: WorkoutSessionDoc;
  /** "Save for later" instant, or null while active/backfilling (T-36.3). */
  pausedAt: string | null;
  testID?: string;
}

/** A backfilled ("Log a past workout") session never has a `pausedAt` and never ticks. */
function isBackfillSession(session: WorkoutSessionDoc): boolean {
  return session.localDate !== localDate();
}

export function ResumeCard({
  bootstrap,
  session,
  pausedAt,
  testID = 'gym-today-resume',
}: ResumeCardProps) {
  const lookup = libraryLookup(bootstrap);
  const supersets = supersetsOf(session, bootstrap);
  const isBackfill = isBackfillSession(session);
  const summary = resumeSummary(session, {
    now: new Date().toISOString(),
    pausedAt,
    isBackfill,
    supersets,
    lookup,
  });

  const progress = summary.setsTotal > 0 ? summary.setsDone / summary.setsTotal : 0;
  const eyebrow =
    summary.state === 'paused'
      ? 'WORKOUT PAUSED'
      : summary.state === 'backfill'
        ? `LOGGING ${weekdayDateLabel(session.localDate).toUpperCase()}`
        : 'WORKOUT IN PROGRESS';

  const focus = focusLine(summary, summary.state === 'paused' ? 'Next' : 'Now');
  const remainingSets = summary.setsTotal - summary.setsDone;
  const primaryLabel = summary.state === 'allLogged' ? 'Finish workout' : 'Resume';
  const goToWorkout = () => router.push('/gym/workout');

  return (
    <Card testID={testID} className="border-primary/30 bg-accent">
      <View accessible accessibilityLabel={accessibleSentence(summary)} className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold tracking-wide text-primary">{eyebrow}</Text>
          {summary.state === 'active' ? (
            <ElapsedTime testID={`${testID}-elapsed`} startedAt={session.startedAt} />
          ) : summary.state === 'paused' ? (
            <Text variant="muted" className="text-sm tabular-nums">
              {Math.round(summary.elapsedSec / 60)} min in
            </Text>
          ) : null}
        </View>

        <Text className="font-semibold">{summary.name}</Text>

        {summary.state === 'allLogged' ? (
          <Text variant="muted" className="text-sm">
            All sets logged · Finish when you’re ready.
          </Text>
        ) : (
          <>
            <ProgressBar
              testID={`${testID}-progress`}
              progress={progress}
              className="h-1.5"
              accessibilityLabel={`${summary.setsDone} of ${summary.setsTotal} sets`}
            />
            <Text variant="muted" className="text-xs">
              {summary.exercisesDone} of {summary.exercisesTotal} exercises · {summary.setsDone} of{' '}
              {summary.setsTotal} sets
            </Text>
            {focus ? (
              <Text variant="muted" className="text-xs" numberOfLines={1}>
                {focus}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-2">
        <Button testID={`${testID}-button`} accessibilityLabel={primaryLabel} onPress={goToWorkout}>
          {primaryLabel}
        </Button>
        {summary.state === 'paused' && remainingSets > 0 ? (
          <Pressable
            testID={`${testID}-finish-with`}
            accessibilityRole="button"
            onPress={goToWorkout}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm font-medium text-primary">
              Finish with {remainingSets} sets
            </Text>
          </Pressable>
        ) : null}
      </View>

      {summary.state === 'paused' && summary.keepsUntilIso ? (
        <Text testID={`${testID}-keeps-until`} variant="muted" className="mt-1 text-xs">
          Keeps until {formatTime(summary.keepsUntilIso)}{' '}
          {keepsUntilDayLabel(summary.keepsUntilIso)}
        </Text>
      ) : null}
    </Card>
  );
}
