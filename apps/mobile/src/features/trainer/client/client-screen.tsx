import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  BOOKING_COPY,
  COACHING_COPY,
  COACHING_DATA_COPY,
  TEMPLATE_COPY,
  type CoachedExerciseDto,
} from '@chefer/types';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedControl,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { deviceTimeZone, todayIn, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { LogCoachedWorkoutButton } from '../../trainer-coach/log-workout-button';
import { useBookingEditor } from '../../trainer-mode/bookings/booking-editor';
import { AssignTemplateSheet } from '../../trainer-mode/templates/assign-sheet';
import { useTrainerModeAvailability } from '../../trainer-mode/use-trainer-mode';
import { CoachingCard } from '../components/coaching-card';
import { goBackOrHome, TrainerHeader } from '../components/trainer-header';
import { AdherenceTab } from './adherence-tab';
import { BookingsTab } from './bookings-tab';
import { FoodTab } from './food-tab';
import { ExerciseHistorySheet } from './history-sheet';
import { NotesTab } from './notes-tab';
import { isClientUnavailable, useTrainerClientName } from './use-trainer-client';
import { WeekSummaryCard } from './week-summary-card';
import { WorkoutsTab } from './workouts-tab';

// ─── One client (spec §2.5) ───────────────────────────────────────────────────
// "Edit routine" opens the routine editor; below it a segmented control: Workouts / Adherence / Notes
// (the private note). "Remove client" (confirm sheet) at the bottom. Every `trainer.client.*` call is
// checked per request: a client who left or was removed answers NOT_FOUND ("This client isn't
// available"), which this screen shows instead of an error.
// PRD 2026-10 §4.3: a client who trains in "Keep it simple" gets a badge in the header and a line saying
// only they can change it. There is deliberately no control here to change a client's training style.
// Trainer mode M2 (trainer-mode.md §6.5): "Assign a template" opens the assign sheet with this client
// ticked — only while trainer mode is available (flag off: this screen is unchanged).
// Trainer mode M3 (§6.5): "Add a booking" (the editor with this client ticked) and a Bookings tab
// (`trainer.client.bookings`), trainer mode only; `initialTab` opens a tab (Today's sessions delivered).
// Lane K2: the "Last 7 days" card (workouts; food and weight only while shared) above the tabs, and a
// Food tab while the client shares their food log or weight.

export type ClientTab = 'workouts' | 'adherence' | 'notes' | 'bookings' | 'food';
type Tab = ClientTab;

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function ClientScreen({
  clientId,
  initialTab = 'workouts',
}: {
  clientId: string;
  initialTab?: ClientTab;
}) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const { name, firstName, keepItSimple: listKeepItSimple } = useTrainerClientName(clientId);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [history, setHistory] = useState<{ exerciseId: string; name: string } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const trainerMode = useTrainerModeAvailability();
  const bookingEditor = useBookingEditor();
  const trainerStatus = trpc.trainer.status.useQuery(undefined, { enabled: trainerMode });
  const overview = trpc.trainer.client.overview.useQuery({ clientId, today: localDate() });
  // Lane K2: an older API sends no `sharing`, which reads as nothing shared.
  const sharing = overview.data?.client.sharing ?? { food: false, weight: false };
  const sharesData = sharing.food || sharing.weight;
  // The Bookings tab exists in trainer mode only; the Food tab while the client shares something.
  const shownTab: Tab =
    (tab === 'bookings' && !trainerMode) || (tab === 'food' && !sharesData) ? 'workouts' : tab;
  const remove = trpc.trainer.clients.remove.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setRemoveOpen(false);
      void utils.trainer.clients.list.invalidate();
      router.replace('/trainer');
    },
  });

  const keepItSimple = overview.data?.client.keepItSimple ?? listKeepItSimple;
  const unavailable = overview.isError && isClientUnavailable(overview.error);
  useEffect(() => {
    // Left or removed: the home list is stale now.
    if (unavailable) void utils.trainer.clients.list.invalidate();
  }, [unavailable, utils]);

  if (unavailable) {
    return (
      <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="trainer-client-unavailable">
        <TrainerHeader testID="trainer-client-header" title={COACHING_COPY.trainer.clients} />
        <EmptyState
          title={COACHING_COPY.server.clientUnavailable}
          icon={<Icon name="clientGone" color={colors.labelTertiary} size={40} />}
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
    <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="trainer-client">
      <TrainerHeader
        testID="trainer-client-header"
        title={overview.data?.client.name ?? name}
        onBack={goBackOrHome}
        right={
          keepItSimple ? (
            <Badge testID="trainer-client-keep-it-simple" variant="secondary">
              {COACHING_COPY.trainerProfile.keepItSimple}
            </Badge>
          ) : null
        }
      />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <CoachingCard className="gap-2">
          {keepItSimple ? (
            <Text
              testID="trainer-client-keep-it-simple-hint"
              className="text-subhead text-label-secondary"
            >
              {COACHING_COPY.trainerProfile.keepItSimpleHint(firstName)}
            </Text>
          ) : null}
          <Button
            testID="trainer-client-edit-routine"
            onPress={() => router.push(`/trainer/${clientId}/routine`)}
          >
            Edit routine
          </Button>
          {trainerMode ? (
            <Button
              testID="trainer-client-assign-template"
              variant="outline"
              onPress={() => setAssignOpen(true)}
            >
              {TEMPLATE_COPY.assign.fromClient}
            </Button>
          ) : null}
          {trainerMode ? (
            <Button
              testID="trainer-client-add-booking"
              variant="outline"
              onPress={() =>
                bookingEditor.open({
                  kind: 'new',
                  prefill: {
                    date: todayIn(deviceTimeZone()),
                    client: { clientId, name },
                    location: trainerStatus.data?.gymLine ?? null,
                  },
                })
              }
            >
              {BOOKING_COPY.clientDetail.addBooking}
            </Button>
          ) : null}
          {trainerMode ? (
            <LogCoachedWorkoutButton clientId={clientId} firstName={firstName} />
          ) : null}
        </CoachingCard>

        <WeekSummaryCard clientId={clientId} firstName={firstName} />

        <SegmentedControl<Tab>
          testID="trainer-client-tabs"
          accessibilityLabel="Client sections"
          {...(trainerMode ? { size: 'xs' as const } : {})}
          value={shownTab}
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
            ...(sharesData
              ? [
                  {
                    value: 'food' as const,
                    label: COACHING_DATA_COPY.tab,
                    testID: 'trainer-client-tab-food',
                  },
                ]
              : []),
            ...(trainerMode
              ? [
                  {
                    value: 'bookings' as const,
                    label: BOOKING_COPY.clientDetail.tab,
                    testID: 'trainer-client-tab-bookings',
                  },
                ]
              : []),
          ]}
        />

        {shownTab === 'workouts' ? (
          <WorkoutsTab clientId={clientId} firstName={firstName} onOpenHistory={openHistory} />
        ) : null}
        {shownTab === 'adherence' ? (
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
        {shownTab === 'bookings' ? <BookingsTab clientId={clientId} /> : null}
        {shownTab === 'food' ? (
          <FoodTab clientId={clientId} firstName={firstName} sharing={sharing} />
        ) : null}
        {shownTab === 'notes' ? <NotesTab clientId={clientId} firstName={firstName} /> : null}

        <Button
          testID="trainer-client-remove"
          variant="outline"
          className="mt-4"
          onPress={() => setRemoveOpen(true)}
        >
          {COACHING_COPY.trainerProfile.endCoaching}
        </Button>
      </ScrollView>

      <ExerciseHistorySheet
        clientId={clientId}
        exercise={history}
        onClose={() => setHistory(null)}
      />
      {bookingEditor.sheet}
      {trainerMode ? (
        <AssignTemplateSheet
          testID="trainer-client-assign-sheet"
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          preselectedClientId={clientId}
        />
      ) : null}
      <ConfirmSheet
        testID="trainer-client-remove-confirm"
        visible={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={COACHING_COPY.trainer.removeClientTitle(firstName)}
        body={COACHING_COPY.trainer.removeClientBody(firstName)}
        confirmLabel={COACHING_COPY.trainerProfile.endCoaching}
        cancelLabel={COACHING_COPY.common.cancel}
        destructive
        busy={remove.isPending}
        error={remove.error ? userFacingErrorMessage(remove.error) : null}
        onConfirm={() => remove.mutate({ clientId })}
      />
    </Screen>
  );
}
