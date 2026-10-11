import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import { trpc } from '../../lib/trpc';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureGymReminderPermission } from '../gym/reminders/permission';
import {
  areWeeklyNotificationsOn,
  cancelWeeklyNotifications,
  scheduleWeeklyNotifications,
} from '../notifications/weekly-notifications';
import { BoardCard } from '../shell/today/parts';
import { TrainButton } from '../shell/train/train-button';

// Weekly updates (audit P2-5, F-PM-14) — every tier:
// - Emails (server): Monday "your week is ready" + Sunday recap, on by
//   default, only sent to a confirmed address (with a resend action here).
//   Same switches as web Preferences and the emails' unsubscribe link.
// - This phone: local repeating notifications at the phone's own time.
//   Off until switched on here — the permission prompt comes from this
//   switch (a user action), never on launch.

type EmailKey = 'weekReady' | 'weeklyRecap';

const EMAIL_ROWS: { key: EmailKey; title: string; description: string }[] = [
  {
    key: 'weekReady',
    title: 'Monday: your week is ready',
    description: "This week's dinners and your estimated shopping list.",
  },
  {
    key: 'weeklyRecap',
    title: 'Sunday: your week in review',
    description: 'Meals logged, days on target, weight and workouts.',
  },
];

function ToggleRow(props: {
  testID: string;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
      <View className="min-w-0 flex-1">
        <Text className="text-body text-label">{props.title}</Text>
        <Text className="mt-0.5 text-subhead text-label-secondary">{props.description}</Text>
      </View>
      <Switch
        testID={props.testID}
        accessibilityLabel={props.title}
        value={props.value}
        disabled={props.disabled ?? false}
        onValueChange={props.onChange}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}

/**
 * T-39.3: existing accounts whose weekly-email switches predate the S15
 * default change (weeklyEmailReady/Recap now default false for NEW rows
 * only) see this once. Shown only when the notice hasn't fired yet AND at
 * least one digest is currently on — a fresh post-change account already
 * starts both off, so "Yours are still on" would be the wrong sentence for it.
 */
function EmailDefaultsNoticeCard({
  onKeepOn,
  onTurnOff,
  busy,
}: {
  onKeepOn: () => void;
  onTurnOff: () => void;
  busy: boolean;
}) {
  return (
    <View
      testID="prefs-email-defaults-notice"
      className="min-w-0 gap-2 rounded-control bg-surface-sunken p-3"
    >
      <Text className="w-full min-w-0 text-subhead text-label">
        We&apos;ve changed how emails work: they&apos;re now off unless you turn them on. Yours are
        still on.
      </Text>
      <View className="flex-row gap-2">
        <TrainButton
          testID="prefs-email-defaults-keep"
          label="Keep them on"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onPress={onKeepOn}
        />
        <TrainButton
          testID="prefs-email-defaults-turn-off"
          label="Turn them off"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onPress={onTurnOff}
        />
      </View>
    </View>
  );
}

export function WeeklyUpdatesCard() {
  const prefsQuery = trpc.notifications.getEmailPreferences.useQuery();
  const meQuery = trpc.user.me.useQuery();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState<Record<EmailKey, boolean> | null>(null);
  const serverReady = prefsQuery.data?.weekReady;
  const serverRecap = prefsQuery.data?.weeklyRecap;
  useEffect(() => {
    if (serverReady !== undefined && serverRecap !== undefined) {
      setEmail({ weekReady: serverReady, weeklyRecap: serverRecap });
    }
  }, [serverReady, serverRecap]);

  const dismissNotice = trpc.user.dismissEmailDefaultsNotice.useMutation({
    onSuccess: (res) =>
      utils.user.me.setData(undefined, (prev) =>
        prev ? { ...prev, emailDefaultsNoticeAt: res.emailDefaultsNoticeAt } : prev,
      ),
  });
  const showEmailDefaultsNotice =
    meQuery.data?.emailDefaultsNoticeAt === null &&
    (prefsQuery.data?.weekReady === true || prefsQuery.data?.weeklyRecap === true);

  const save = trpc.notifications.setEmailPreferences.useMutation({
    meta: { silent: true },
    onSuccess: (res) => setEmail({ weekReady: res.weekReady, weeklyRecap: res.weeklyRecap }),
    // Roll back only the switch that failed.
    onError: (_err, vars) =>
      setEmail((prev) =>
        prev
          ? {
              weekReady: vars.weekReady !== undefined ? !vars.weekReady : prev.weekReady,
              weeklyRecap: vars.weeklyRecap !== undefined ? !vars.weeklyRecap : prev.weeklyRecap,
            }
          : prev,
      ),
  });
  const resend = trpc.notifications.resendConfirmation.useMutation({ meta: { silent: true } });

  const [phoneOn, setPhoneOn] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNote, setPhoneNote] = useState<string | null>(null);
  // UX-ACC-20: the user just answered the permission prompt with "no" — show
  // the Open Settings row right away, without waiting for the OS re-read.
  const [phoneRefused, setPhoneRefused] = useState(false);
  // §6.8: with notifications denied in the OS the switch must not say "On".
  const notificationPermission = useNotificationPermission();
  const notificationsDenied = notificationPermission === 'denied';
  useEffect(() => {
    let alive = true;
    void areWeeklyNotificationsOn().then((on) => {
      if (alive) setPhoneOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  const togglePhone = async (next: boolean) => {
    setPhoneBusy(true);
    setPhoneNote(null);
    setPhoneRefused(false);
    try {
      if (!next) {
        await cancelWeeklyNotifications();
        setPhoneOn(false);
        return;
      }
      const allowed = await ensureGymReminderPermission();
      refreshNotificationPermission();
      if (!allowed) {
        setPhoneRefused(true);
        setPhoneOn(false);
        return;
      }
      const ok = await scheduleWeeklyNotifications();
      setPhoneOn(ok);
      if (!ok) setPhoneNote("Couldn't set up the notifications. Try again.");
    } finally {
      setPhoneBusy(false);
    }
  };

  const toggleEmail = (key: EmailKey, next: boolean) => {
    setEmail((prev) => (prev ? { ...prev, [key]: next } : prev));
    save.mutate({ [key]: next });
  };

  const keepEmailDefaults = () => dismissNotice.mutate();
  const turnOffEmailDefaults = () => {
    setEmail({ weekReady: false, weeklyRecap: false });
    save.mutate({ weekReady: false, weeklyRecap: false });
    dismissNotice.mutate();
  };

  return (
    <BoardCard testID="prefs-weekly-updates">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        Weekly updates
      </Text>

      {showEmailDefaultsNotice && (
        <EmailDefaultsNoticeCard
          onKeepOn={keepEmailDefaults}
          onTurnOff={turnOffEmailDefaults}
          busy={dismissNotice.isPending || save.isPending}
        />
      )}

      <View className="gap-1">
        <Text className="text-subhead font-semibold text-label-secondary">On this phone</Text>
        <ToggleRow
          testID="prefs-weekly-push-switch"
          title="Monday plan and Sunday recap"
          description="A notification at 8:00 on Monday and 18:00 on Sunday."
          value={phoneOn && !notificationsDenied && !phoneRefused}
          disabled={phoneBusy}
          onChange={(next) => void togglePhone(next)}
        />
        {notificationsDenied || phoneRefused ? (
          <NotificationsOffRow testID="prefs-weekly-push-off" />
        ) : (
          phoneNote && <Text className="text-caption text-attention">{phoneNote}</Text>
        )}
      </View>

      {email && prefsQuery.data && (
        <View className="gap-1">
          <Text className="text-subhead font-semibold text-label-secondary">By email</Text>
          <Text className="text-caption text-label-tertiary">Sent to {prefsQuery.data.email}.</Text>
          {EMAIL_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              testID={`prefs-weekly-email-${row.key}`}
              title={row.title}
              description={row.description}
              value={email[row.key]}
              disabled={save.isPending}
              onChange={(next) => toggleEmail(row.key, next)}
            />
          ))}
          {!prefsQuery.data.emailConfirmed && (
            <View className="mt-1 min-w-0 gap-2 rounded-control bg-surface-sunken p-3">
              <Text className="w-full min-w-0 text-subhead text-label">
                Confirm your email address to start getting these.
              </Text>
              {resend.isSuccess ? (
                <Text
                  testID="prefs-weekly-email-sent"
                  className="w-full min-w-0 text-subhead font-semibold text-label"
                >
                  {resend.data.alreadyConfirmed
                    ? 'Your address is already confirmed.'
                    : 'Sent. Check your inbox for the confirmation link.'}
                </Text>
              ) : (
                <TrainButton
                  testID="prefs-weekly-email-confirm"
                  label="Send confirmation link"
                  variant="outline"
                  loading={resend.isPending}
                  onPress={() => resend.mutate()}
                />
              )}
              {resend.isError && (
                <Text className="text-caption text-danger">
                  {userFacingErrorMessage(resend.error)}
                </Text>
              )}
            </View>
          )}
          {save.isError && (
            <Text className="text-caption text-danger">Couldn&apos;t save that. Try again.</Text>
          )}
        </View>
      )}
    </BoardCard>
  );
}
