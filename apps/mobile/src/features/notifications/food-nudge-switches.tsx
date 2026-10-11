import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureGymReminderPermission } from '../gym/reminders/permission';
import {
  DINNER_NUDGE_HOUR,
  DINNER_NUDGE_MINUTE,
  getFoodNudgePrefs,
  writeFoodNudgePrefs,
} from './food-nudges';
import { useFoodNudgePrefs } from './use-food-nudges';

// The two opt-in food nudges as switches (UX-PO-08) — the one control used by
// the last onboarding question and by Settings → Notifications, so the two can
// never disagree. Turning one on is a user action, so it is where the OS
// permission is asked; a refusal leaves the switch off and shows the standard
// "Off for Chefer" row. Scheduling itself is the root `FoodNudgeHost`'s job
// (it reacts to the stored choice).

const pad = (n: number) => String(n).padStart(2, '0');

export const DINNER_NUDGE_COPY = {
  title: 'Log dinner',
  description: `At ${pad(DINNER_NUDGE_HOUR)}:${pad(DINNER_NUDGE_MINUTE)} on evenings when dinner isn’t logged yet.`,
};
export const PLAN_NUDGE_COPY = {
  title: 'Plan Sunday',
  description: 'A Sunday evening nudge to pick next week’s dinners.',
};

function NudgeRow(props: {
  testID: string;
  title: string;
  description: string;
  value: boolean;
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
        onValueChange={props.onChange}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}

export interface FoodNudgeSwitchesProps {
  /** Prefix for the test ids: `<prefix>-dinner`, `<prefix>-plan`, `<prefix>-off`. */
  testIDPrefix: string;
}

export function FoodNudgeSwitches({ testIDPrefix }: FoodNudgeSwitchesProps) {
  const prefs = useFoodNudgePrefs();
  const permission = useNotificationPermission();
  // The user just answered the OS prompt with "no": say so right away, without
  // waiting for the permission re-read.
  const [refused, setRefused] = useState(false);
  const denied = permission === 'denied' || refused;

  const change = (key: 'dinner' | 'planSunday', next: boolean) => {
    if (!next) {
      setRefused(false);
      writeFoodNudgePrefs({ ...getFoodNudgePrefs(), [key]: false });
      return;
    }
    void ensureGymReminderPermission().then((allowed) => {
      refreshNotificationPermission();
      setRefused(!allowed);
      if (allowed) writeFoodNudgePrefs({ ...getFoodNudgePrefs(), [key]: true });
    });
  };

  return (
    <View className="gap-1">
      <NudgeRow
        testID={`${testIDPrefix}-dinner`}
        {...DINNER_NUDGE_COPY}
        value={prefs.dinner && !denied}
        onChange={(next) => change('dinner', next)}
      />
      <NudgeRow
        testID={`${testIDPrefix}-plan`}
        {...PLAN_NUDGE_COPY}
        value={prefs.planSunday && !denied}
        onChange={(next) => change('planSunday', next)}
      />
      {denied && <NotificationsOffRow testID={`${testIDPrefix}-off`} message="Nudges are off" />}
    </View>
  );
}
