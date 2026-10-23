import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY } from '@chefer/types';
import {
  Button,
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { ClientRow } from '../components/client-row';
import { CoachingCard } from '../components/coaching-card';
import { TrainerFeedbackLink } from '../components/trainer-feedback-link';
import { TrainerHeader } from '../components/trainer-header';
import { CheckInSettingsCard } from './check-in-settings-card';
import { RequestsSection } from './requests-section';
import { TrainerAlertsCard } from './trainer-alerts-card';
import { TrainerNotices } from './trainer-notices';
import { TrainerProfileCard } from './trainer-profile-card';
import { useTurnOffTrainerTools } from './use-turn-off-trainer-tools';

// ─── Trainer home: Clients (spec §2.4) ────────────────────────────────────────
// One row per active client: name, last workout, this week's sessions against the client's goal, a quiet
// flag after 7 days without a workout, and "Routine changed by Maria · 3 Oct" when the client edited
// after the trainer last did. Tap → the client. Above the list: the trainer's notices and Requests
// (PRD 2026-10 §4.1–4.2); below it: the profile (name, gym line), turn trainer tools off, Send feedback.
// A client who trains in "Keep it simple" wears a small badge (PRD 2026-10 §4.3); only they can change it.

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function TrainerHome() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() });
  // PRD 2026-10 §4.3: the confirmation names the client count first.
  const turnOff = useTurnOffTrainerTools({
    testID: 'trainer-home-turn-off-confirm',
    fallbackClients: clients.data?.length ?? 0,
  });

  return (
    <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="trainer-home">
      <TrainerHeader testID="trainer-home-header" title={COACHING_COPY.trainer.clients} />
      <KeyboardAwareScrollView
        testID="trainer-home-scroll"
        contentContainerClassName="gap-3 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={clients.isRefetching}
            onRefresh={() => {
              void clients.refetch();
              void utils.trainer.requests.list.invalidate();
              void utils.coaching.notices.invalidate();
            }}
          />
        }
      >
        {/* PRD 2026-10 §4.2: what clients did since the trainer last looked. */}
        <TrainerNotices />
        {/* PRD 2026-10 §4.1: coaching requests from Find a trainer. */}
        <RequestsSection />

        <Button testID="trainer-home-invite" onPress={() => router.push('/trainer/invite')}>
          {COACHING_COPY.trainer.invite}
        </Button>

        {clients.isPending ? (
          <View testID="trainer-home-loading" className="items-center py-10">
            <ActivityIndicator />
          </View>
        ) : clients.isError ? (
          <ErrorState testID="trainer-home-error" onRetry={() => void clients.refetch()} />
        ) : clients.data.length === 0 ? (
          <EmptyState
            testID="trainer-home-empty"
            icon={<Icon name="clients" color={colors.labelTertiary} size={40} />}
            title={COACHING_COPY.trainer.clientsEmpty}
            description={COACHING_COPY.trainer.turnOnBody}
          />
        ) : (
          clients.data.map((row) => <ClientRow key={row.clientId} row={row} />)
        )}

        <TrainerProfileCard />
        <CheckInSettingsCard />
        <TrainerAlertsCard />

        <CoachingCard className="mt-4 gap-2">
          <Text testID="trainer-home-turn-off-body" className="text-subhead text-label-secondary">
            {turnOff.body}
          </Text>
          <Button testID="trainer-home-turn-off" variant="outline" onPress={turnOff.request}>
            {COACHING_COPY.trainer.turnOff}
          </Button>
        </CoachingCard>
        <TrainerFeedbackLink />
      </KeyboardAwareScrollView>

      {turnOff.sheet}
    </Screen>
  );
}
