import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MUSCLE_LABELS } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  LineChart,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import { formatLoad } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { exerciseImageUrl } from '../library/exercise-image';
import { localBestSets, localE1rmSeries, localRepPrTable } from '../stats/local-engine';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { getExerciseNote, setExerciseNote } from './exercise-notes';
import { ExerciseVideoSheet } from './exercise-video-sheet';
import { useIsOnline } from './online-status';
import { PhotoCrossfade } from './photo-crossfade';
import { StackBackButton } from './stack-back-button';

// Exercise detail (gym_plan.md §1.3): photos, technique video, cues/mistakes,
// muscles, blurb and "your history" (e1RM mini-chart, best sets, rep PRs,
// last 5 sessions and a sticky personal note). Custom exercises also get
// edit/archive.

const HISTORY_LIMIT = 5;

export function ExerciseDetailScreen({ exerciseId }: { exerciseId: string }) {
  const { data: bootstrap, isLoading } = useGymBootstrap();
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const [videoVisible, setVideoVisible] = useState(false);
  const [note, setNote] = useState(() => getExerciseNote(exerciseId));

  const cachedExercise = bootstrap?.library.find((e) => e.id === exerciseId);
  const { data: fetchedExercise } = trpc.gym.library.get.useQuery(
    { id: exerciseId },
    { enabled: !cachedExercise && online },
  );
  const exercise = cachedExercise ?? fetchedExercise;

  const archiveMutation = trpc.gym.library.archiveCustom.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      router.back();
    },
  });

  const sessions = useMemo(() => bootstrap?.recentSessions ?? [], [bootstrap]);
  const e1rmSeries = useMemo(() => localE1rmSeries(sessions, exerciseId), [sessions, exerciseId]);
  const bestSets = useMemo(() => localBestSets(sessions, exerciseId, 3), [sessions, exerciseId]);
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

  const onArchive = () => {
    Alert.alert(
      'Archive this exercise?',
      'It stays in past sessions but won’t show up when adding exercises.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => archiveMutation.mutate({ id: exerciseId }),
        },
      ],
    );
  };

  if (!exercise) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-exercise-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text testID="gym-exercise-title" variant="title" className="mb-2">
            Exercise
          </Text>
          {isLoading ? (
            <Text variant="muted">Loading…</Text>
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
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2" testID="gym-exercise-detail">
        <View className="flex-row items-center gap-3">
          <StackBackButton testID="gym-exercise-title-back" />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text testID="gym-exercise-title" variant="title" className="min-w-0 flex-1">
            {exercise.name}
          </Text>
          {isCustom ? (
            <View className="flex-row gap-2">
              <Pressable
                testID="exercise-detail-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit exercise"
                onPress={() =>
                  router.push({ pathname: '/gym/exercise-form', params: { id: exerciseId } })
                }
                className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
              >
                <Ionicons name="pencil-outline" size={20} color="#374151" />
              </Pressable>
              <Pressable
                testID="exercise-detail-archive"
                accessibilityRole="button"
                accessibilityLabel="Archive exercise"
                onPress={onArchive}
                className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
              >
                <Ionicons name="archive-outline" size={20} color="#374151" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <PhotoCrossfade images={images} testID="exercise-detail-photos" />

        <Button
          testID="exercise-detail-watch"
          variant="outline"
          onPress={() => setVideoVisible(true)}
        >
          {exercise.videoId ? 'Watch technique' : 'No technique video yet'}
        </Button>
        {exercise.videoChannel ? <Text variant="muted">Video: {exercise.videoChannel}</Text> : null}

        {exercise.cues.length > 0 ? (
          <Card testID="exercise-detail-cues">
            <CardTitle>Focus on</CardTitle>
            {exercise.cues.map((cue, i) => (
              <Text key={i} className="mb-1">
                • {cue}
              </Text>
            ))}
          </Card>
        ) : null}

        {exercise.mistakes.length > 0 ? (
          <Card testID="exercise-detail-mistakes">
            <CardTitle>Avoid</CardTitle>
            {exercise.mistakes.map((mistake, i) => (
              <Text key={i} className="mb-1">
                • {mistake}
              </Text>
            ))}
          </Card>
        ) : null}

        <Card testID="exercise-detail-muscles">
          <CardTitle>Muscles worked</CardTitle>
          <Text className="mb-1">
            Primary: {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
          </Text>
          {exercise.secondaryMuscles.length > 0 ? (
            <Text variant="muted">
              Secondary: {exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
            </Text>
          ) : null}
        </Card>

        {exercise.blurb ? (
          <Card testID="exercise-detail-blurb">
            <Text variant="muted">{exercise.blurb}</Text>
          </Card>
        ) : null}

        <View>
          <Text variant="heading" className="mb-2">
            Your history
          </Text>

          <LineChart
            testID="exercise-detail-e1rm-chart"
            data={e1rmSeries.points.map((p) => ({
              x: Date.parse(p.localDate),
              y: p.e1rmKg,
              highlight: p.isPr,
            }))}
            trend={e1rmSeries.trend}
            formatY={(v) => formatLoad(v, unit)}
            emptyLabel="Log this exercise to see your trend"
          />

          {bestSets.length > 0 ? (
            <Card testID="exercise-detail-best-sets" className="mt-3">
              <CardTitle>Best sets</CardTitle>
              {bestSets.map((set, i) => (
                <View key={i} className="mb-1 flex-row items-center justify-between">
                  <Text>
                    {formatLoad(set.weightKg, unit)} × {set.reps}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {set.isPr ? <Badge variant="warning">PR</Badge> : null}
                    <Text variant="muted">{set.localDate}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {repPrTable.length > 0 ? (
            <Card testID="exercise-detail-rep-prs" className="mt-3">
              <CardTitle>Best reps at each weight</CardTitle>
              {repPrTable.map((row, i) => (
                <View key={i} className="mb-1 flex-row items-center justify-between">
                  <Text>{formatLoad(row.weightKg, unit)}</Text>
                  <Text>{row.reps} reps</Text>
                  <Text variant="muted">{row.localDate}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {lastSessions.length > 0 ? (
            <View className="mt-3">
              <Text variant="label" className="mb-1">
                Last {lastSessions.length} sessions
              </Text>
              {lastSessions.map((session) => (
                <Pressable
                  key={session.id}
                  testID={`exercise-detail-session-${session.id}`}
                  accessibilityRole="button"
                  onPress={() => router.push(`/gym/session/${session.id}`)}
                  className="min-h-11 flex-row items-center justify-between border-b border-border py-2"
                >
                  <Text>{session.localDate}</Text>
                  <Text variant="muted">{session.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text variant="muted" className="mt-3">
              No sessions with this exercise yet.
            </Text>
          )}

          <View className="mt-3">
            <Text variant="label" className="mb-1">
              Your notes
            </Text>
            <Input
              testID="exercise-detail-note"
              value={note}
              onChangeText={onSaveNote}
              placeholder="A personal cue or reminder…"
              multiline
              className="min-h-11 py-2"
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
      </ScrollView>
    </Screen>
  );
}
