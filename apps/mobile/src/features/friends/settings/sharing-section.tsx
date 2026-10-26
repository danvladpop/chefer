import { useState } from 'react';
import { Switch, View } from 'react-native';
import type { Catalog } from '@chefer/i18n';
import type { FriendsMeDto } from '@chefer/types';
import { Text, useSnackbar, useThemeColors } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
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
/** `friends.settings.*` messages without placeholders. */
type SettingsKey =
  `friends.settings.${keyof Catalog['friends']['settings'] & ('plan' | 'recipes' | 'workouts' | 'targets' | 'targetsDetail')}`;

const SWITCHES: readonly {
  section: Section;
  key: 'sharePlan' | 'shareRecipes' | 'shareWorkouts' | 'shareTargets';
  label: SettingsKey;
  detail?: SettingsKey;
}[] = [
  { section: 'plan', key: 'sharePlan', label: 'friends.settings.plan' },
  { section: 'recipes', key: 'shareRecipes', label: 'friends.settings.recipes' },
  { section: 'workouts', key: 'shareWorkouts', label: 'friends.settings.workouts' },
  {
    section: 'targets',
    key: 'shareTargets',
    label: 'friends.settings.targets',
    detail: 'friends.settings.targetsDetail',
  },
];

export function SharingSection({ settings }: { settings: Settings }) {
  const { t } = useT();
  const targetsConfirm: ConfirmCopy = {
    title: t('friends.targets.confirm.title'),
    body: t('friends.targets.confirm.body'),
    confirmLabel: t('friends.targets.confirm.cta'),
    cancelLabel: t('friends.common.cancel'),
    destructive: false,
  };
  const { save } = useUpdateSettings();
  const snackbar = useSnackbar();
  const colors = useThemeColors();
  const [targetsVisible, setTargetsVisible] = useState(false);

  const afterSave = (section: Section, on: boolean, hidden: number) => {
    track('friends_sharing_changed', { section, on });
    if (section === 'recipes' && on && hidden > 0) {
      snackbar.show({
        message: t('friends.activated.filterHidden', { count: hidden }),
        tone: 'info',
      });
    }
  };

  const toggle = async (section: Section, key: (typeof SWITCHES)[number]['key'], on: boolean) => {
    const input: UpdateSettingsInput = { [key]: on };
    const outcome = await save(input, { optimistic: true });
    if (!outcome.ok) {
      snackbar.show({ message: t('friends.settings.saveError') });
      return;
    }
    afterSave(section, on, outcome.result.filterHiddenRecipes);
  };

  return (
    <View testID="friends-settings-sharing" className="gap-1">
      {SWITCHES.map(({ section, key, label: labelKey, detail: detailKey }) => {
        const label = t(labelKey);
        const detail = detailKey ? t(detailKey) : undefined;
        return (
          <View
            key={key}
            testID={`friends-settings-row-${section}`}
            className="min-h-11 flex-row items-center gap-3 py-2"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-body text-label">{label}</Text>
              {detail ? (
                <Text className="mt-0.5 text-subhead text-label-secondary">{detail}</Text>
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
              trackColor={{ true: colors.brand, false: colors.separator }}
            />
          </View>
        );
      })}

      <FriendsConfirmSheet
        testID="friends-settings-targets-confirm"
        visible={targetsVisible}
        copy={targetsConfirm}
        errorMessage={t('friends.settings.saveError')}
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
