import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { HIDDEN_EXERCISE_IMAGE_IDS, MUSCLE_LABELS } from '@chefer/types';
import {
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  KeyboardAwareScrollView,
  LineChart,
  PressableScale,
  Screen,
  showSnackbar,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  formatLoad,
  formatLocalDateLong,
  isNotFoundError,
  lastSessionsLabel,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useShellChrome } from '../../shell/shell-chrome';
import { TrainButton } from '../../shell/train/train-button';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { exerciseImageUrl } from '../library/exercise-image';
import { localBestSets, localE1rmSeries, localRepPrTable } from '../stats/local-engine';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { ExerciseNoteField } from './exercise-note-field';
import { getExerciseNote, setExerciseNote } from './exercise-notes';
import { ExerciseVideoSheet } from './exercise-video-sheet';
import { useIsOnline } from './online-status';
import { PhotoCrossfade } from './photo-crossfade';
import { StackBackButton } from './stack-back-button';

// Exercise detail (gym_plan.md §1.3): photos, technique video, cues/mistakes,
// muscles, blurb and "your history" (e1RM mini-chart, best sets, rep PRs,
// last 5 sessions and a sticky personal note). Custom exercises also get
// edit/archive.

// 10 Oct redesign: canvas page, the shell's brand-chevron Back (falling back
// to the pushed route's chrome when there is one), a title1 name, and each
// section a surface card with a headline title.

const HISTORY_LIMIT = 5;

/** A surface card with a headline title — the shell's card vocabulary. */
function SectionCard({
  title,
  testID,
  children,
}: {
  title?: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View testID={testID} className="gap-1.5 rounded-card border border-separator bg-surface p-4">
      {title ? (
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-1 text-subhead font-semibold text-label-secondary"
    >
      {children}
    </Text>
  );
}

function PrPill() {
  return (
    <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
      PR
    </Text>
  );
}

/** First and last point's date under the chart, e.g. "3 Aug 2026" … "24 Sep 2026". */
function chartDateLabels(localDates: readonly string[]): { x: number; label: string }[] {
  const first = localDates[0];
  const last = localDates[localDates.length - 1];
  if (first === undefined || last === undefined) return [];
  const labels = [{ x: Date.parse(first), label: formatLocalDateLong(first) }];
  if (last !== first) labels.push({ x: Date.parse(last), label: formatLocalDateLong(last) });
  return labels;
}

export function ExerciseDetailScreen({ exerciseId }: { exerciseId: string }) {
  const colors = useThemeColors();
  const chrome = useShellChrome();
  const backFallback = chrome?.kind === 'pushed' ? { fallback: chrome.fallback } : {};
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  // UX-GYM-24: a failed load is an error with Retry, not "Loading…" or "not found".
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const [videoVisible, setVideoVisible] = useState(false);
  const [note, setNote] = useState(() => getExerciseNote(exerciseId));
  const [noteFocused, setNoteFocused] = useState(false);

  const cachedExercise = bootstrap?.library.find((e) => e.id === exerciseId);
  const fetchedQuery = trpc.gym.library.get.useQuery(
    { id: exerciseId },
    { enabled: !cachedExercise && online },
  );
  const fetchedExercise = fetchedQuery.data;
  const exercise = cachedExercise ?? fetchedExercise;

  const archiveMutation = trpc.gym.library.archiveCustom.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      setArchiveConfirmOpen(false);
      router.back();
      // UX-GYM-34: archiving can be undone — here for 10 s, and from the
      // Exercises tab's "Archived" section afterwards. Imperative client: this
      // screen is gone by the time the action is tapped.
      const name = exercise?.name ?? 'Exercise';
      showSnackbar({
        message: `Archived “${name}”.`,
        actionLabel: 'Undo',
        onAction: () => {
          utils.client.gym.library.restoreCustom
            .mutate({ id: exerciseId })
            .then(() => utils.gym.bootstrap.invalidate())
            .catch((err: unknown) => showSnackbar({ message: userFacingErrorMessage(err) }));
        },
      });
    },
    // The ConfirmSheet shows the failure itself — no default snackbar.
    meta: { silent: true },
  });

  const sessions = useMemo(() => bootstrap?.recentSessions ?? [], [bootstrap]);
  const e1rmSeries = useMemo(
    () => localE1rmSeries(sessions, exerciseId, bootstrap?.olderBests),
    [sessions, exerciseId, bootstrap?.olderBests],
  );
  const bestSets = useMemo(
    () => localBestSets(sessions, exerciseId, 3, bootstrap?.olderBests),
    [sessions, exerciseId, bootstrap?.olderBests],
  );
  const repPrTable = useMemo(() => localRepPrTable(sessions, exerciseId), [sessions, exerciseId]);
  const lastSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId && !e.skipped))
        .slice(0, HISTORY_LIMIT),
    [sessions, exerciseId],
  );

  const unit = bootstrap?.profile?.unit ?? 'KG';

  const onSaveNote = (value: string) => {
    setNote(value);
    setExerciseNote(exerciseId, value);
  };

  // UX-GYM-22 / X-13: confirmed in a ConfirmSheet (not a native Alert), so a
  // failed archive is shown in the sheet rather than lost.
  const onArchive = () => {
    archiveMutation.reset();
    setArchiveConfirmOpen(true);
  };

  if (!exercise) {
    return (
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="min-h-11 flex-row items-center px-4 pt-2">
          <StackBackButton testID="gym-exercise-title-back" {...backFallback} />
        </View>
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Text
            testID="gym-exercise-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
          >
            Exercise
          </Text>
          {bootstrapLoad.load === 'loading' || fetchedQuery.isLoading ? (
            <View className="items-center gap-2">
              <ActivityIndicator color={colors.brand} />
              <Text className="text-subhead text-label-secondary">Loading…</Text>
            </View>
          ) : bootstrapLoad.load === 'error' || bootstrapLoad.load === 'offline' ? (
            <GymBootstrapUnavailable
              load={bootstrapLoad.load}
              onRetry={bootstrapLoad.retry}
              testID="exercise-detail"
              what="this exercise"
            />
          ) : fetchedQuery.isError && !isNotFoundError(fetchedQuery.error) ? (
            <ErrorState
              testID="exercise-detail-error"
              title="Couldn’t load this exercise"
              onRetry={() => void fetchedQuery.refetch()}
            />
          ) : (
            <EmptyState
              testID="exercise-detail-not-found"
              title="Exercise not found"
              description={online ? 'It may have been removed.' : 'Connect to load it.'}
            />
          )}
        </View>
      </Screen>
    );
  }

  const images = [exerciseImageUrl(exercise, 0), exerciseImageUrl(exercise, 1)].filter(
    (u): u is string => u !== null,
  );
  const isCustom = exercise.ownerId !== null;

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      {/* UX-GYM-35: keyboard-aware, with a sticky "Done" bar while the note is
          being typed (the note autosaves; Done just puts the keyboard away). */}
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        testID="gym-exercise-detail"
        footer={
          noteFocused ? (
            <View className="border-t border-separator bg-surface px-4 py-2">
              <TrainButton
                testID="exercise-detail-note-done"
                label="Done"
                variant="outline"
                onPress={() => Keyboard.dismiss()}
              />
            </View>
          ) : undefined
        }
      >
        <View className="min-h-11 flex-row items-center justify-between gap-2">
          <StackBackButton testID="gym-exercise-title-back" {...backFallback} />
          {isCustom ? (
            <View className="flex-row items-center gap-1">
              <IconButton
                testID="exercise-detail-edit"
                accessibilityLabel="Edit exercise"
                variant="tinted"
                icon={<Icon name="edit" color={colors.brand} size={20} />}
                onPress={() =>
                  router.push({ pathname: '/gym/exercise-form', params: { id: exerciseId } })
                }
              />
              <IconButton
                testID="exercise-detail-archive"
                accessibilityLabel="Archive exercise"
                variant="tinted"
                // No archive glyph in the shared Icon set yet; same tint role.
                icon={
                  <Ionicons
                    name="archive-outline"
                    size={20}
                    color={colors.brand}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                }
                onPress={onArchive}
              />
            </View>
          ) : null}
        </View>
        <Text
          testID="gym-exercise-title"
          accessibilityRole="header"
          className="-mt-2 text-title1 font-bold text-label"
        >
          {exercise.name}
        </Text>

        <PhotoCrossfade
          images={images}
          equipment={exercise.equipment}
          primaryMuscleLabel={
            exercise.primaryMuscles[0] ? MUSCLE_LABELS[exercise.primaryMuscles[0]] : null
          }
          hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(exercise.id)}
          testID="exercise-detail-photos"
        />

        <View className="gap-1.5">
          <TrainButton
            testID="exercise-detail-watch"
            label={exercise.videoId ? 'Watch technique' : 'No technique video yet'}
            icon={exercise.videoId ? 'play' : undefined}
            variant={exercise.videoId ? 'tinted' : 'outline'}
            onPress={() => setVideoVisible(true)}
          />
          {exercise.videoChannel ? (
            <Text className="px-1 text-caption text-label-secondary">
              Video: {exercise.videoChannel}
            </Text>
          ) : null}
        </View>

        {exercise.cues.length > 0 ? (
          <SectionCard testID="exercise-detail-cues" title="Focus on">
            {exercise.cues.map((cue, i) => (
              <Text key={i} className="text-body text-label">
                • {cue}
              </Text>
            ))}
          </SectionCard>
        ) : null}

        {exercise.mistakes.length > 0 ? (
          <SectionCard testID="exercise-detail-mistakes" title="Avoid">
            {exercise.mistakes.map((mistake, i) => (
              <Text key={i} className="text-body text-label">
                • {mistake}
              </Text>
            ))}
          </SectionCard>
        ) : null}

        <SectionCard testID="exercise-detail-muscles" title="Muscles worked">
          <Text className="text-body text-label">
            Primary: {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
          </Text>
          {exercise.secondaryMuscles.length > 0 ? (
            <Text className="text-subhead text-label-secondary">
              Secondary: {exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
            </Text>
          ) : null}
        </SectionCard>

        {exercise.blurb ? (
          <SectionCard testID="exercise-detail-blurb">
            <Text className="text-body text-label-secondary">{exercise.blurb}</Text>
          </SectionCard>
        ) : null}

        <View className="gap-3">
          <Text accessibilityRole="header" className="text-title3 font-bold text-label">
            Your history
          </Text>

          <SectionCard>
            {/* UX-GYM-33: the chart says what it plots and where it starts and ends. */}
            <Text
              testID="exercise-detail-e1rm-caption"
              className="text-caption text-label-secondary"
            >
              Estimated 1-rep max over time
            </Text>
            <LineChart
              testID="exercise-detail-e1rm-chart"
              data={e1rmSeries.points.map((p) => ({
                x: Date.parse(p.localDate),
                y: p.e1rmKg,
                highlight: p.isPr,
              }))}
              trend={e1rmSeries.trend}
              color={colors.brand}
              niceTicks
              xLabels={chartDateLabels(e1rmSeries.points.map((p) => p.localDate))}
              accessibilityLabel={`Estimated 1-rep max for ${exercise.name}`}
              formatY={(v) => formatLoad(v, unit)}
              emptyLabel="Log this exercise to see your trend"
            />
          </SectionCard>

          {bestSets.length > 0 ? (
            <SectionCard testID="exercise-detail-best-sets" title="Best sets">
              {bestSets.map((set, i) => (
                <View key={i} className="min-h-7 flex-row items-center justify-between gap-2">
                  <Text className="min-w-0 shrink text-body text-label">
                    {formatLoad(set.weightKg, unit, exercise.loadType, { each: exercise.perHand })}{' '}
                    × {set.reps}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {set.isPr ? <PrPill /> : null}
                    <Text className="text-subhead text-label-secondary">
                      {formatLocalDateLong(set.localDate)}
                    </Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {repPrTable.length > 0 ? (
            <SectionCard testID="exercise-detail-rep-prs" title="Best reps at each weight">
              {repPrTable.map((row, i) => (
                <View key={i} className="min-h-7 flex-row items-center justify-between gap-2">
                  <Text className="text-body text-label">
                    {formatLoad(row.weightKg, unit, exercise.loadType, { each: exercise.perHand })}
                  </Text>
                  <Text className="text-body text-label">{row.reps} reps</Text>
                  <Text className="text-subhead text-label-secondary">
                    {formatLocalDateLong(row.localDate)}
                  </Text>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {lastSessions.length > 0 ? (
            <View className="gap-1.5">
              <GroupTitle>{lastSessionsLabel(lastSessions.length)}</GroupTitle>
              <View className="overflow-hidden rounded-card border border-separator bg-surface">
                {lastSessions.map((session, i) => (
                  // MO-01 press feedback on each session row.
                  <PressableScale
                    key={session.id}
                    testID={`exercise-detail-session-${session.id}`}
                    accessibilityRole="button"
                    accessibilityHint="Opens the workout"
                    onPress={() => router.push(`/gym/session/${session.id}`)}
                    className={[
                      'min-h-11 flex-row items-center gap-3 py-2.5 pl-4 pr-3',
                      i > 0 ? 'border-t border-separator' : '',
                    ].join(' ')}
                  >
                    <Text className="text-body text-label">
                      {formatLocalDateLong(session.localDate)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-right text-subhead text-label-secondary"
                    >
                      {session.name}
                    </Text>
                    <Icon name="chevronRight" color={colors.labelTertiary} size={18} />
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : (
            <Text className="px-1 text-subhead text-label-secondary">
              No sessions with this exercise yet.
            </Text>
          )}

          <View className="gap-1.5">
            <GroupTitle>Your notes</GroupTitle>
            <ExerciseNoteField
              value={note}
              onChangeText={onSaveNote}
              onFocusChange={setNoteFocused}
            />
          </View>
        </View>

        {exercise.videoId ? (
          <ExerciseVideoSheet
            visible={videoVisible}
            onClose={() => setVideoVisible(false)}
            videoId={exercise.videoId}
            startSec={exercise.videoStartSec ?? 0}
            channel={exercise.videoChannel}
          />
        ) : null}
      </KeyboardAwareScrollView>
      <ConfirmSheet
        visible={archiveConfirmOpen}
        onClose={() => setArchiveConfirmOpen(false)}
        title="Archive this exercise?"
        body="It stays in past sessions but won’t show up when adding exercises."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        destructive
        busy={archiveMutation.isPending}
        error={archiveMutation.error ? userFacingErrorMessage(archiveMutation.error) : null}
        onConfirm={() => archiveMutation.mutate({ id: exerciseId })}
        testID="exercise-detail-archive-confirm"
      />
    </Screen>
  );
}
