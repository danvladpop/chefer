import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COACHING_COPY, type CoachedExerciseDto } from '@chefer/types';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedControl,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { goBackOrHome, TrainerHeader } from '../components/trainer-header';
import { AdherenceTab } from './adherence-tab';
import { ExerciseHistorySheet } from './history-sheet';
import { NotesTab } from './notes-tab';
import { isClientUnavailable, useTrainerClientName } from './use-trainer-client';
import { WorkoutsTab } from './workouts-tab';

// ─── One client (spec §2.5) ───────────────────────────────────────────────────
// "Edit routine" opens the routine editor; below it a segmented control: Workouts / Adherence / Notes
// (the private note). "Remove client" (confirm sheet) at the bottom. Every `trainer.client.*` call is
// checked per request: a client who left or was removed answers NOT_FOUND ("This client isn't
// available"), which this screen shows instead of an error.

type Tab = 'workouts' | 'adherence' | 'notes';

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function ClientScreen({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const { name, firstName } = useTrainerClientName(clientId);
  const [tab, setTab] = useState<Tab>('workouts');
  const [history, setHistory] = useState<{ exerciseId: string; name: string } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const overview = trpc.trainer.client.overview.useQuery({ clientId, today: localDate() });
  const remove = trpc.trainer.clients.remove.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setRemoveOpen(false);
      void utils.trainer.clients.list.invalidate();
      router.replace('/trainer');
    },
  });

  const unavailable = overview.isError && isClientUnavailable(overview.error);
  useEffect(() => {
    // Left or removed: the home list is stale now.
    if (unavailable) void utils.trainer.clients.list.invalidate();
  }, [unavailable, utils]);

  if (unavailable) {
    return (
      <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-client-unavailable">
        <TrainerHeader testID="trainer-client-header" title={COACHING_COPY.trainer.clients} />
        <EmptyState
          title={COACHING_COPY.server.clientUnavailable}
          icon={<Ionicons name="person-remove-outline" size={40} color="#9ca3af" />}
          action={{
            label: 'Back to clients',
            testID: 'trainer-client-unavailable-back',
            onPress: () => router.replace('/trainer'),
          }}
        />
      </Screen>
    );
  }

  const openHistory = (exercise: CoachedExerciseDto) =>
    setHistory({ exerciseId: exercise.exerciseId, name: exercise.name });

  return (
    <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-client">
      <TrainerHeader
        testID="trainer-client-header"
        title={overview.data?.client.name ?? name}
        onBack={goBackOrHome}
      />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <Card className="gap-2">
          <Button
            testID="trainer-client-edit-routine"
            onPress={() => router.push(`/trainer/${clientId}/routine`)}
          >
            Edit routine
          </Button>
        </Card>

        <SegmentedControl<Tab>
          testID="trainer-client-tabs"
          accessibilityLabel="Client sections"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'workouts',
              label: COACHING_COPY.trainer.tabs.workouts,
              testID: 'trainer-client-tab-workouts',
            },
            {
              value: 'adherence',
              label: COACHING_COPY.trainer.tabs.adherence,
              testID: 'trainer-client-tab-adherence',
            },
            {
              value: 'notes',
              label: COACHING_COPY.trainer.tabs.notes,
              testID: 'trainer-client-tab-notes',
            },
          ]}
        />

        {tab === 'workouts' ? (
          <WorkoutsTab clientId={clientId} firstName={firstName} onOpenHistory={openHistory} />
        ) : null}
        {tab === 'adherence' ? (
          overview.isPending ? (
            <View testID="trainer-adherence-loading" className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : overview.isError ? (
            <ErrorState testID="trainer-adherence-error" onRetry={() => void overview.refetch()} />
          ) : (
            <AdherenceTab adherence={overview.data.adherence} />
          )
        ) : null}
        {tab === 'notes' ? <NotesTab clientId={clientId} firstName={firstName} /> : null}

        <Button
          testID="trainer-client-remove"
          variant="outline"
          className="mt-4"
          onPress={() => setRemoveOpen(true)}
        >
          {COACHING_COPY.trainer.removeClient}
        </Button>
      </ScrollView>

      <ExerciseHistorySheet
        clientId={clientId}
        exercise={history}
        onClose={() => setHistory(null)}
      />
      <ConfirmSheet
        testID="trainer-client-remove-confirm"
        visible={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={COACHING_COPY.trainer.removeClientTitle(firstName)}
        body={COACHING_COPY.trainer.removeClientBody(firstName)}
        confirmLabel={COACHING_COPY.trainer.removeClient}
        cancelLabel={COACHING_COPY.common.cancel}
        destructive
        busy={remove.isPending}
        error={remove.error ? userFacingErrorMessage(remove.error) : null}
        onConfirm={() => remove.mutate({ clientId })}
      />
    </Screen>
  );
}
