import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { ensureGymReminderPermission } from '../gym/reminders/permission';
import {
  areWeeklyNotificationsOn,
  cancelWeeklyNotifications,
  scheduleWeeklyNotifications,
} from '../notifications/weekly-notifications';

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

const TRACK = { true: '#944a00', false: '#d1d5db' };

function ToggleRow(props: {
  testID: string;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-gray-900">{props.title}</Text>
        <Text variant="muted" className="text-xs">
          {props.description}
        </Text>
      </View>
      <Switch
        testID={props.testID}
        accessibilityLabel={props.title}
        value={props.value}
        disabled={props.disabled ?? false}
        onValueChange={props.onChange}
        trackColor={TRACK}
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
    <View testID="prefs-email-defaults-notice" className="gap-2 rounded-lg bg-amber-50 p-3">
      <Text className="text-sm text-amber-900">
        We&apos;ve changed how emails work: they&apos;re now off unless you turn them on. Yours are
        still on.
      </Text>
      <View className="flex-row gap-2">
        <Button
          testID="prefs-email-defaults-keep"
          variant="outline"
          size="sm"
          disabled={busy}
          onPress={onKeepOn}
        >
          Keep them on
        </Button>
        <Button
          testID="prefs-email-defaults-turn-off"
          variant="outline"
          size="sm"
          disabled={busy}
          onPress={onTurnOff}
        >
          Turn them off
        </Button>
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
  const resend = trpc.notifications.resendConfirmation.useMutation();

  const [phoneOn, setPhoneOn] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNote, setPhoneNote] = useState<string | null>(null);
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
    try {
      if (!next) {
        await cancelWeeklyNotifications();
        setPhoneOn(false);
        return;
      }
      if (!(await ensureGymReminderPermission())) {
        setPhoneNote("Notifications are off for Chefer. Turn them on in your phone's Settings.");
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
    <Card testID="prefs-weekly-updates" className="gap-3">
      <Text variant="heading">Weekly updates</Text>

      {showEmailDefaultsNotice && (
        <EmailDefaultsNoticeCard
          onKeepOn={keepEmailDefaults}
          onTurnOff={turnOffEmailDefaults}
          busy={dismissNotice.isPending || save.isPending}
        />
      )}

      <View className="gap-1">
        <Text variant="label">On this phone</Text>
        <ToggleRow
          testID="prefs-weekly-push-switch"
          title="Monday plan and Sunday recap"
          description="A notification at 8:00 on Monday and 18:00 on Sunday."
          value={phoneOn}
          disabled={phoneBusy}
          onChange={(next) => void togglePhone(next)}
        />
        {phoneNote && <Text className="text-xs text-amber-800">{phoneNote}</Text>}
      </View>

      {email && prefsQuery.data && (
        <View className="gap-1">
          <Text variant="label">By email</Text>
          <Text variant="muted" className="text-xs">
            Sent to {prefsQuery.data.email}.
          </Text>
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
            <View className="mt-1 gap-2 rounded-lg bg-amber-50 p-3">
              <Text className="text-sm text-amber-900">
                Confirm your email address to start getting these.
              </Text>
              {resend.isSuccess ? (
                <Text
                  testID="prefs-weekly-email-sent"
                  className="text-sm font-medium text-amber-900"
                >
                  {resend.data.alreadyConfirmed
                    ? 'Your address is already confirmed.'
                    : 'Sent. Check your inbox for the confirmation link.'}
                </Text>
              ) : (
                <Button
                  testID="prefs-weekly-email-confirm"
                  variant="outline"
                  size="sm"
                  loading={resend.isPending}
                  onPress={() => resend.mutate()}
                >
                  Send confirmation link
                </Button>
              )}
              {resend.isError && (
                <Text className="text-xs text-red-600">{userFacingErrorMessage(resend.error)}</Text>
              )}
            </View>
          )}
          {save.isError && (
            <Text className="text-xs text-red-600">Couldn&apos;t save that. Try again.</Text>
          )}
        </View>
      )}
    </Card>
  );
}
