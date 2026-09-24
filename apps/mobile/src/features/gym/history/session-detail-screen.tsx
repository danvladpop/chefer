import { useMemo } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Badge, Button, Card, CardTitle, EmptyState, Screen, Text } from '@chefer/ui-mobile';
import { cn, formatLoad } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';
import { StackBackButton } from '../library-screens/stack-back-button';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { sessionDurationMin, viewFromDoc, viewFromSummary, type SessionView } from './session-view';

// Past session detail (gym_plan.md §1.3): date, duration, each exercise's
// sets (warm-ups dimmed), RIR and notes, with a guarded delete. Offline-first:
// renders from the cached `recentSessions` summary immediately, then upgrades
// to the full `session.get` doc (adds notes) once online.

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const { data: bootstrap, isLoading: bootstrapLoading } = useGymBootstrap();

  const summary = bootstrap?.recentSessions.find((s) => s.id === sessionId);
  const { data: fullDoc, isLoading: docLoading } = trpc.gym.session.get.useQuery(
    { id: sessionId },
    { enabled: online },
  );

  const view: SessionView | undefined = useMemo(() => {
    if (fullDoc) return viewFromDoc(fullDoc);
    if (summary) return viewFromSummary(summary);
    return undefined;
  }, [fullDoc, summary]);

  const deleteMutation = trpc.gym.session.delete.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      router.back();
    },
  });

  const libraryLookup = useMemo(
    () => new Map((bootstrap?.library ?? []).map((e) => [e.id, e])),
    [bootstrap],
  );

  const onDelete = () => {
    Alert.alert(
      'Delete this session?',
      'Your progression for its exercises will be recalculated as if it never happened.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate({ id: sessionId }),
        },
      ],
    );
  };

  if (!view) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-session-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text testID="gym-session-title" variant="title" className="mb-2">
            Session
          </Text>
          {bootstrapLoading || docLoading ? (
            <Text variant="muted">Loading…</Text>
          ) : (
            <EmptyState
              testID="session-detail-not-found"
              title="Session not found"
              description={online ? 'It may have been deleted.' : 'Connect to load it.'}
            />
          )}
        </View>
      </Screen>
    );
  }

  const duration = sessionDurationMin(view);
  const unit = bootstrap?.profile?.unit ?? 'KG';

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2" testID="gym-session-detail">
        <View className="flex-row items-center gap-3">
          <StackBackButton testID="gym-session-title-back" />
          <View className="min-w-0 flex-1">
            <Text testID="gym-session-title" variant="title" numberOfLines={1}>
              {view.name}
            </Text>
            <Text variant="muted">
              {view.localDate}
              {duration !== null ? ` · ${duration} min` : ''}
              {view.isDeload ? ' · Deload' : ''}
            </Text>
          </View>
          <Button
            testID="session-detail-delete"
            variant="ghost"
            size="icon"
            accessibilityLabel="Delete session"
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={20} color="#b91c1c" />
          </Button>
        </View>

        {view.notes ? (
          <Card testID="session-detail-notes">
            <Text variant="muted">{view.notes}</Text>
          </Card>
        ) : null}

        {view.exercises.map((exercise) => {
          const meta = libraryLookup.get(exercise.exerciseId);
          return (
            <Card
              key={exercise.exerciseId}
              testID={`session-detail-exercise-${exercise.exerciseId}`}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <CardTitle className="mb-0">{meta?.name ?? exercise.exerciseId}</CardTitle>
                {exercise.skipped ? <Badge variant="secondary">Skipped</Badge> : null}
              </View>
              {!exercise.skipped &&
                exercise.sets.map((set, i) => (
                  <View
                    key={i}
                    className={cn(
                      'flex-row items-center justify-between py-1',
                      set.isWarmup && 'opacity-50',
                    )}
                  >
                    <Text variant={set.isWarmup ? 'muted' : 'default'}>
                      {set.isWarmup ? 'Warm-up' : `Set ${i + 1}`}
                    </Text>
                    <Text variant={set.isWarmup ? 'muted' : 'default'}>
                      {formatLoad(set.weightKg, unit)} × {set.reps}
                      {!set.completed ? ' (not done)' : ''}
                    </Text>
                  </View>
                ))}
              {!exercise.skipped && exercise.lastSetRir !== null ? (
                <Text variant="muted" className="mt-1">
                  RIR: {exercise.lastSetRir}
                </Text>
              ) : null}
              {exercise.notes ? (
                <Text variant="muted" className="mt-1">
                  {exercise.notes}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
