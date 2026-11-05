import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import { IconButton, Screen, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import { useT } from '../../lib/i18n';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { useCoachingStatus } from '../coaching/use-coaching-status';
import { ensureRestNotificationPermission } from '../gym/rest-timer';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import { WeeklyUpdatesCard } from '../preferences/weekly-updates-card';
import { TrainButton } from '../shell/train/train-button';
import { BookingReminderSwitch } from './booking-reminder-switch';
import { FoodNudgeSwitches } from './food-nudge-switches';
import { MealReminderSettings } from './meal-reminder-settings';

// Settings → Notifications (UX-PO-08, WP-13): every reminder Chefer can send, in
// one place. Mealtime reminders (lane E1) sit above the food nudges. Weekly updates (phone + email) are the same card Preferences
// shows; the training reminder time lives in gym settings, so that row only
// reports and opens it; the dinner / plan-Sunday nudges and the rest-timer
// alert are controlled here. Class reminders arrive with classes (WP-05) and
// have no row until then.

// 11 Oct restyle: the shell's look — canvas, hairline surface cards, named
// text styles and colour roles, and ShellTopBar's brand chevron + title1 top
// bar (drawn locally so Back and the title keep their testIDs).

/** The redesign's card: a surface on the canvas with a hairline border. */
const CARD = 'gap-3 rounded-card border border-separator bg-surface p-4';

function trainingReminderSummary(
  profile: { reminderEnabled: boolean; reminderTime: string | null },
  t: Translator['t'],
): string {
  return profile.reminderEnabled && profile.reminderTime
    ? t('today.engagement.notifications.training.on', { time: profile.reminderTime })
    : t('today.engagement.notifications.training.off');
}

function TrainingRemindersRow() {
  const bootstrap = useGymBootstrap();
  const profile = bootstrap.data?.profile ?? null;
  // Food-only accounts have no training profile — nothing to remind about.
  const colors = useThemeColors();
  const { t } = useT();
  if (!profile) return null;
  const summary = trainingReminderSummary(profile, t);
  return (
    <View className="overflow-hidden rounded-card border border-separator bg-surface">
      <Pressable
        testID="notifications-training"
        accessibilityRole="button"
        accessibilityLabel={t('today.engagement.notifications.training.label', { summary })}
        onPress={() => router.push('/gym/settings?section=reminders')}
        style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSunken } : undefined)}
        className="min-h-14 flex-row items-center gap-3 px-4 py-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-body text-label">
            {t('today.engagement.notifications.training.title')}
          </Text>
          <Text
            testID="notifications-training-summary"
            className="mt-0.5 text-subhead text-label-secondary"
          >
            {summary}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
      </Pressable>
    </View>
  );
}

function RestTimerAlertsCard() {
  const permission = useNotificationPermission();
  const { t } = useT();
  return (
    <View testID="notifications-rest-timer" className={CARD}>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {t('today.engagement.notifications.restTimer.title')}
        </Text>
        <Text className="text-subhead text-label-secondary">
          {t('today.engagement.notifications.restTimer.body')}
        </Text>
      </View>
      {permission === 'granted' && (
        <Text
          testID="notifications-rest-timer-on"
          className="self-start rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
        >
          {t('today.engagement.notifications.restTimer.on')}
        </Text>
      )}
      {permission === 'undetermined' && (
        <TrainButton
          testID="notifications-rest-timer-enable"
          label={t('today.engagement.notifications.restTimer.enable')}
          variant="tinted"
          icon="notifications"
          className="self-start"
          onPress={() => {
            void ensureRestNotificationPermission().then(() => refreshNotificationPermission());
          }}
        />
      )}
      {permission === 'denied' && (
        <NotificationsOffRow
          testID="notifications-rest-timer-off"
          message={t('today.engagement.notifications.restTimer.off')}
        />
      )}
    </View>
  );
}

/** Trainer mode §7.3: a client's "Booking reminders" — only for someone who has a trainer. */
function BookingRemindersCard() {
  const { data } = useCoachingStatus();
  if (!data?.trainer) return null;
  return (
    <View testID="notifications-bookings" className={CARD}>
      <BookingReminderSwitch role="client" testID="notifications-booking-reminders" />
    </View>
  );
}

export function NotificationsScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
        <IconButton
          testID="notifications-back"
          accessibilityLabel={t('common.actions.back')}
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          className="-ml-2"
        />
        <Text
          testID="notifications-title"
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-title1 font-bold text-label"
        >
          {t('today.engagement.notifications.title')}
        </Text>
      </View>
      <ScrollView
        testID="notifications-scroll"
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
      >
        <WeeklyUpdatesCard />
        <TrainingRemindersRow />
        <BookingRemindersCard />
        <View testID="notifications-meal-reminders" className={CARD}>
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {t('today.reminders.cardTitle')}
          </Text>
          <MealReminderSettings testIDPrefix="notifications-meals" />
        </View>
        <View testID="notifications-food-nudges" className={CARD}>
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {t('today.engagement.notifications.foodNudges')}
          </Text>
          <FoodNudgeSwitches testIDPrefix="notifications-nudge" />
        </View>
        <RestTimerAlertsCard />
      </ScrollView>
    </Screen>
  );
}
