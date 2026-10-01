import { useState } from 'react';
import { Switch, View } from 'react-native';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { Text, useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { FriendsConfirmSheet, type ConfirmCopy } from '../safety/confirm-copy';
import { useUpdateSettings, type UpdateSettingsInput } from './use-update-settings';

// ─── What followers can see (UX §11.1, FR-04) ──────────────────────────────────
// Four switches that save on change (optimistic, MO-08; a failure puts the
// switch back with `Couldn’t save. Try again.`). Two have extra behaviour:
//   • recipes ON may answer `filterHiddenRecipes > 0` — recipes whose words
//     trip the filter stay hidden from followers: the §4.1 snackbar says how many;
//   • targets ON asks first (`Share your daily targets?`) and saves only once
//     confirmed, so the switch stays off until then (turning it OFF is direct).

type Settings = NonNullable<FriendsMeDto['settings']>;
type Section = 'plan' | 'recipes' | 'workouts' | 'targets';

const SWITCHES: readonly {
  section: Section;
  key: 'sharePlan' | 'shareRecipes' | 'shareWorkouts' | 'shareTargets';
  label: string;
  detail?: string;
}[] = [
  { section: 'plan', key: 'sharePlan', label: FRIENDS_COPY.settings.plan },
  { section: 'recipes', key: 'shareRecipes', label: FRIENDS_COPY.settings.recipes },
  { section: 'workouts', key: 'shareWorkouts', label: FRIENDS_COPY.settings.workouts },
  {
    section: 'targets',
    key: 'shareTargets',
    label: FRIENDS_COPY.settings.targets,
    detail: FRIENDS_COPY.settings.targetsDetail,
  },
];

const TARGETS_CONFIRM: ConfirmCopy = {
  title: FRIENDS_COPY.targets.confirm.title,
  body: FRIENDS_COPY.targets.confirm.body,
  confirmLabel: FRIENDS_COPY.targets.confirm.cta,
  cancelLabel: FRIENDS_COPY.common.cancel,
  destructive: false,
};

export function SharingSection({ settings }: { settings: Settings }) {
  const { save } = useUpdateSettings();
  const snackbar = useSnackbar();
  const [targetsVisible, setTargetsVisible] = useState(false);

  const afterSave = (section: Section, on: boolean, hidden: number) => {
    track('friends_sharing_changed', { section, on });
    if (section === 'recipes' && on && hidden > 0) {
      snackbar.show({ message: FRIENDS_COPY.activated.filterHidden(hidden), tone: 'info' });
    }
  };

  const toggle = async (section: Section, key: (typeof SWITCHES)[number]['key'], on: boolean) => {
    const input: UpdateSettingsInput = { [key]: on };
    const outcome = await save(input, { optimistic: true });
    if (!outcome.ok) {
      snackbar.show({ message: FRIENDS_COPY.settings.saveError });
      return;
    }
    afterSave(section, on, outcome.result.filterHiddenRecipes);
  };

  return (
    <View testID="friends-settings-sharing" className="gap-1">
      {SWITCHES.map(({ section, key, label, detail }) => (
        <View
          key={key}
          testID={`friends-settings-row-${section}`}
          className="min-h-11 flex-row items-center gap-3 py-1"
        >
          <View className="min-w-0 flex-1">
            <Text>{label}</Text>
            {detail ? (
              <Text variant="muted" className="text-xs">
                {detail}
              </Text>
            ) : null}
          </View>
          <Switch
            testID={`friends-settings-share-${section}`}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: settings[key] }}
            value={settings[key]}
            onValueChange={(on) => {
              if (section === 'targets' && on) {
                setTargetsVisible(true);
                return;
              }
              void toggle(section, key, on);
            }}
            trackColor={{ true: '#944a00', false: '#d1d5db' }}
          />
        </View>
      ))}

      <FriendsConfirmSheet
        testID="friends-settings-targets-confirm"
        visible={targetsVisible}
        copy={TARGETS_CONFIRM}
        errorMessage={FRIENDS_COPY.settings.saveError}
        onConfirm={async () => {
          const outcome = await save({ shareTargets: true });
          return outcome.ok;
        }}
        onClose={() => setTargetsVisible(false)}
        onDone={() => track('friends_sharing_changed', { section: 'targets', on: true })}
      />
    </View>
  );
}
