import { Switch, View } from 'react-native';
import {
  PUSH_COPY,
  PUSH_PREFERENCE_AUDIENCE,
  type PushPreferenceKey,
  type PushPreferencesDto,
} from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { NotificationsOffRow } from '../../../components/notifications-off-row';
import { trpc } from '../../../lib/trpc';
import { useNotificationPermission } from '../../../lib/use-notification-permission';

// ─── Push switches (trainer-mode.md §6.8, §7.2, M4) ───────────────────────────
// One switch per preference key (default on; a missing server row is "on"),
// shown once the account has a registered device (`hasDevice`) — before that
// the switches would control nothing. Two homes:
//  - Settings → Notifications: "Push notifications", the client and everyone keys;
//  - trainer You (trainer mode only): "Trainer notifications", the trainer keys.
// A flip is optimistic and rolls back if the server refuses (the app-wide
// snackbar says why). With the OS permission off, the row that opens the
// phone's Settings says so; the switches stay usable (they are per account,
// other devices may still get the pushes).

export type PushPreferenceScreen = 'settings' | 'trainer';

/** The keys a screen shows (§7.2 audience): trainer You → trainer; Settings → client + everyone. */
export function pushPreferenceKeysFor(
  screen: PushPreferenceScreen,
  dto: PushPreferencesDto,
  options: { coaching: boolean } = { coaching: true },
): PushPreferenceKey[] {
  return dto.preferences
    .map((p) => p.key)
    .filter((key) => {
      const audience = PUSH_PREFERENCE_AUDIENCE[key];
      if (screen === 'trainer') return audience === 'trainer';
      if (audience === 'client') return options.coaching;
      return audience === 'everyone';
    });
}

export function PushPreferencesCard({
  screen,
  coaching = true,
  testID,
}: {
  screen: PushPreferenceScreen;
  /** Settings: whether coaching exists for this account (hides the coaching keys when not). */
  coaching?: boolean;
  testID: string;
}) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const permission = useNotificationPermission();
  const query = trpc.notifications.push.preferences.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const set = trpc.notifications.push.setPreference.useMutation({
    onMutate: async ({ key, enabled }) => {
      await utils.notifications.push.preferences.cancel();
      const previous = utils.notifications.push.preferences.getData();
      utils.notifications.push.preferences.setData(undefined, (old) =>
        old
          ? {
              ...old,
              preferences: old.preferences.map((p) => (p.key === key ? { ...p, enabled } : p)),
            }
          : old,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous)
        utils.notifications.push.preferences.setData(undefined, context.previous);
    },
    onSettled: () => {
      void utils.notifications.push.preferences.invalidate();
    },
  });

  const dto = query.data;
  if (!dto?.hasDevice) return null;
  const keys = pushPreferenceKeysFor(screen, dto, { coaching });
  if (keys.length === 0) return null;
  const enabled = new Map(dto.preferences.map((p) => [p.key, p.enabled]));
  const off = permission === 'denied';
  const title = screen === 'trainer' ? PUSH_COPY.settings.trainerTitle : PUSH_COPY.settings.title;

  return (
    <View testID={testID} className="gap-3 rounded-card border border-separator bg-surface p-4">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {title}
      </Text>
      {off ? (
        <NotificationsOffRow
          testID={`${testID}-off`}
          message={PUSH_COPY.settings.deviceOff}
          detail={null}
          actionLabel={PUSH_COPY.settings.openSettings}
        />
      ) : null}
      {keys.map((key) => {
        const label = PUSH_COPY.settings.labels[key];
        return (
          <View key={key} className="min-h-11 flex-row items-center justify-between gap-3 py-1">
            <Text className="min-w-0 flex-1 text-body text-label">{label}</Text>
            <Switch
              testID={`${testID}-${key}`}
              accessibilityLabel={label}
              value={enabled.get(key) ?? true}
              onValueChange={(next) => set.mutate({ key, enabled: next })}
              trackColor={{ true: colors.brand, false: colors.separator }}
            />
          </View>
        );
      })}
    </View>
  );
}
