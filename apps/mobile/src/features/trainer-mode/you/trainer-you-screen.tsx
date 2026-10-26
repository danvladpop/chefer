import { useState } from 'react';
import { Linking, View } from 'react-native';
import { COACHING_LIMITS, SUPPORT_EMAIL, TRAINER_MODE_COPY } from '@chefer/types';
import {
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  Screen,
  Stagger,
  Text,
  useFirstEntrance,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { AppearanceRow } from '../../appearance/appearance-screen';
import { useFriendsMe } from '../../friends/api/use-friends-me';
import { BookingReminderSwitch } from '../../notifications/booking-reminder-switch';
import { ShellTopBar } from '../../shell/shell-chrome';
import { YouHelpSection, YouSignOutFooter } from '../../shell/you/you-footer';
import { trainerFeedbackMailto } from '../../trainer/components/trainer-feedback-link';
import { CheckInSettingsCard } from '../../trainer/home/check-in-settings-card';
import { TrainerAlertsCard } from '../../trainer/home/trainer-alerts-card';
import { TrainerProfileCard } from '../../trainer/home/trainer-profile-card';
import { useTurnOffTrainerTools } from '../../trainer/home/use-turn-off-trainer-tools';
import { InviteSheet } from '../../trainer/invite/invite-screen';
import { ModeSwitchSection } from '../mode-switch-row';
import { switchShellMode } from '../switch-mode';

// ─── Trainer You (docs/prd-2026-10/trainer-mode.md §6.8, M1) ──────────────────
// First "Switch to personal mode", badged with what waits there (Following).
// Then the trainer's own settings, moved from Trainer tools: the profile
// (name clients see, gym line), Invites (the same sheet as Clients), the
// read-only availability (it closes by itself at the client limit, no
// switch), the trainer feedback mail, and Turn off trainer tools — which
// also leaves trainer mode. Help, Sign out and the version line are personal
// You's own pieces.

const COPY = TRAINER_MODE_COPY.you;

/** "Accepting new clients" until the client limit (PRD Q16b: no switch). */
export function availabilityText(activeClients: number): string {
  return activeClients < COACHING_LIMITS.maxActiveClients
    ? COPY.accepting
    : COPY.notAccepting(COACHING_LIMITS.maxActiveClients);
}

export function TrainerYouScreen() {
  const colors = useThemeColors();
  // MO-03: the sections rise in on the first visit of the session only.
  const firstEntrance = useFirstEntrance('trainer-you');
  const [inviteOpen, setInviteOpen] = useState(false);
  const { badgeCount: personalWaiting } = useFriendsMe();
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const activeClients = status.data?.activeClients ?? 0;
  // After turning off, trainer mode is gone: land on personal Today.
  const turnOff = useTurnOffTrainerTools({
    testID: 'trainer-you-turn-off-confirm',
    onTurnedOff: () => switchShellMode('personal'),
  });

  return (
    <Screen className="bg-canvas px-0" testID="trainer-you">
      <KeyboardAwareScrollView
        testID="trainer-you-scroll"
        contentContainerClassName="gap-6 px-4 pb-8"
      >
        <Stagger enabled={firstEntrance}>
          <ShellTopBar />

          <ModeSwitchSection
            to="personal"
            waiting={personalWaiting}
            testID="trainer-you-switch-to-personal"
          />

          <View className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="px-4 text-subhead font-semibold text-label-secondary"
            >
              {COPY.profile}
            </Text>
            <TrainerProfileCard />
            <CheckInSettingsCard />
            <TrainerAlertsCard />
          </View>

          <ListSection title={TRAINER_MODE_COPY.mode.trainer} footer={COPY.availabilityHint}>
            <ListRow
              testID="trainer-you-invites"
              title={COPY.invites}
              subtitle={COPY.invitesHint}
              icon={<Icon name="invite" color={colors.brand} />}
              onPress={() => setInviteOpen(true)}
            />
            <ListRow
              testID="trainer-you-availability"
              title={COPY.availability}
              {...(status.data ? { subtitle: availabilityText(activeClients) } : {})}
              icon={<Icon name="availability" color={colors.brand} />}
            />
          </ListSection>

          {/* M3 §7.3: local reminders an hour before each of the trainer's own bookings. */}
          <View
            testID="trainer-you-booking-reminders"
            className="rounded-card border border-separator bg-surface px-4 py-2"
          >
            <BookingReminderSwitch role="trainer" testID="trainer-you-booking-reminders-switch" />
          </View>

          {/* Night mode is a phone setting, so it is here in trainer mode too. */}
          <ListSection>
            <AppearanceRow testID="trainer-you-appearance" />
          </ListSection>

          <YouHelpSection
            feedback={
              <ListRow
                testID="trainer-you-feedback"
                title={COPY.feedback}
                icon={<Icon name="feedback" color={colors.brand} />}
                accessibilityHint={SUPPORT_EMAIL}
                onPress={() => {
                  Linking.openURL(trainerFeedbackMailto()).catch(() => undefined);
                }}
              />
            }
          />

          <ListSection footer={turnOff.body}>
            <ListRow
              testID="trainer-you-turn-off"
              title={COPY.turnOff}
              icon={<Icon name="turnOff" color={colors.danger} />}
              destructive
              onPress={turnOff.request}
            />
          </ListSection>

          <YouSignOutFooter />
        </Stagger>
      </KeyboardAwareScrollView>
      {turnOff.sheet}
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Screen>
  );
}
