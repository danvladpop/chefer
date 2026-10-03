import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureRestNotificationPermission } from '../gym/rest-timer';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import { WeeklyUpdatesCard } from '../preferences/weekly-updates-card';
import { FoodNudgeSwitches } from './food-nudge-switches';

// Settings → Notifications (UX-PO-08, WP-13): every reminder Chefer can send, in
// one place. Weekly updates (phone + email) are the same card Preferences
// shows; the training reminder time lives in gym settings, so that row only
// reports and opens it; the dinner / plan-Sunday nudges and the rest-timer
// alert are controlled here. Class reminders arrive with classes (WP-05) and
// have no row until then.

function trainingReminderSummary(profile: {
  reminderEnabled: boolean;
  reminderTime: string | null;
}): string {
  return profile.reminderEnabled && profile.reminderTime ? `On, at ${profile.reminderTime}` : 'Off';
}

function TrainingRemindersRow() {
  const bootstrap = useGymBootstrap();
  const profile = bootstrap.data?.profile ?? null;
  // Food-only accounts have no training profile — nothing to remind about.
  if (!profile) return null;
  return (
    <Card className="p-0">
      <Pressable
        testID="notifications-training"
        accessibilityRole="button"
        accessibilityLabel={`Training reminders. ${trainingReminderSummary(profile)}`}
        onPress={() => router.push('/gym/settings?section=reminders')}
        className="min-h-14 flex-row items-center gap-3 px-4 py-2"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-900">Training reminders</Text>
          <Text testID="notifications-training-summary" variant="muted" className="text-xs">
            {trainingReminderSummary(profile)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      </Pressable>
    </Card>
  );
}

function RestTimerAlertsCard() {
  const permission = useNotificationPermission();
  return (
    <Card testID="notifications-rest-timer" className="gap-2">
      <Text variant="heading">Rest-timer alerts</Text>
      <Text variant="muted" className="text-sm">
        A “Rest is over” alert when Chefer is in the background during a workout or a cooking timer.
      </Text>
      {permission === 'granted' && (
        <Text testID="notifications-rest-timer-on" className="text-sm font-medium text-gray-900">
          On
        </Text>
      )}
      {permission === 'undetermined' && (
        <Button
          testID="notifications-rest-timer-enable"
          variant="outline"
          size="sm"
          onPress={() => {
            void ensureRestNotificationPermission().then(() => refreshNotificationPermission());
          }}
        >
          Turn on alerts
        </Button>
      )}
      {permission === 'denied' && (
        <NotificationsOffRow
          testID="notifications-rest-timer-off"
          message="Rest-timer alerts are off"
        />
      )}
    </Card>
  );
}

export function NotificationsScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          testID="notifications-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text
          testID="notifications-title"
          variant="heading"
          accessibilityRole="header"
          className="min-w-0 flex-1"
        >
          Notifications
        </Text>
      </View>
      <ScrollView
        testID="notifications-scroll"
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-8"
      >
        <WeeklyUpdatesCard />
        <TrainingRemindersRow />
        <Card testID="notifications-food-nudges" className="gap-2">
          <Text variant="heading">Food nudges</Text>
          <FoodNudgeSwitches testIDPrefix="notifications-nudge" />
        </Card>
        <RestTimerAlertsCard />
      </ScrollView>
    </Screen>
  );
}
