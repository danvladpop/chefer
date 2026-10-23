import { useState } from 'react';
import { Switch, View } from 'react-native';
import type { CelebrationLevel, ProgressSettings } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  SegmentedControl,
  SelectSheet,
  Sheet,
  Skeleton,
  Text,
  TimePicker,
  useThemeColors,
} from '@chefer/ui-mobile';
import { goalDaysLabel, PROGRESS_COPY } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureGymReminderPermission } from '../gym/reminders/permission';
import { ShellTopBar } from '../shell/shell-chrome';
import { PauseCard } from './pause-card';
import { useFlameActions } from './use-flame-actions';
import { useProgressEnabled, useProgressSummary } from './use-progress';
import { useUpdateProgressSettings } from './use-progress-settings';

// Rewards & motivation (mockup 12), pushed from You → Settings. How loud
// Kitchen progress is, and whether it is there at all: celebrations (Full
// party / Subtle / Off — Off still saves everything, quietly), "Show XP &
// levels", the weekly active-day goal, Biscuit, the flame on Today, a pause,
// and the gentle reminder (off by default; the OS permission is asked only
// when it is switched on).

const CELEBRATION_OPTIONS: { value: CelebrationLevel; label: string; testID: string }[] = [
  {
    value: 'FULL',
    label: `${PROGRESS_COPY.celebrationsFull} 🎉`,
    testID: 'rewards-celebrations-full',
  },
  {
    value: 'SUBTLE',
    label: PROGRESS_COPY.celebrationsSubtle,
    testID: 'rewards-celebrations-subtle',
  },
  { value: 'OFF', label: PROGRESS_COPY.celebrationsOff, testID: 'rewards-celebrations-off' },
];
const GOAL_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((g) => ({
  value: String(g),
  label: goalDaysLabel(g),
}));

function ToggleRow({
  title,
  body,
  value,
  onChange,
  testID,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="min-h-14 flex-row items-center justify-between gap-3 py-2">
      <View className="min-w-0 flex-1">
        <Text className="text-headline font-semibold text-label">{title}</Text>
        <Text className="text-subhead text-label-secondary">{body}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.positive, false: colors.separator }}
      />
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

function ReminderCard({ settings }: { settings: ProgressSettings }) {
  const colors = useThemeColors();
  const { update } = useUpdateProgressSettings();
  const permission = useNotificationPermission();
  const [refused, setRefused] = useState(false);
  const [picking, setPicking] = useState(false);
  const denied = permission === 'denied' || refused;
  const { enabled, time } = settings.reminder;
  const [hour, minute] = time.split(':').map(Number);

  const toggle = (next: boolean) => {
    if (!next) {
      setRefused(false);
      update({ reminder: { enabled: false } });
      return;
    }
    // Asked here, from the switch, never on launch.
    void ensureGymReminderPermission().then((granted) => {
      refreshNotificationPermission();
      setRefused(!granted);
      if (granted) update({ reminder: { enabled: true } });
    });
  };

  return (
    <View
      testID="rewards-reminder"
      className="gap-2 rounded-card border border-separator bg-surface p-4"
    >
      <ToggleRow
        testID="rewards-reminder-switch"
        title={PROGRESS_COPY.reminderTitle}
        body={PROGRESS_COPY.reminderBody}
        value={enabled && !denied}
        onChange={toggle}
      />
      {enabled && !denied ? (
        <PressableScale
          testID="rewards-reminder-time"
          accessibilityRole="button"
          accessibilityLabel={`${PROGRESS_COPY.reminderTimeTitle}, ${time}`}
          onPress={() => setPicking(true)}
          className="min-h-11 flex-row items-center justify-between gap-3 rounded-control bg-brand-tint px-4"
        >
          <Text className="text-callout font-semibold text-label">
            {PROGRESS_COPY.reminderTimeTitle}
          </Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-callout font-bold text-brand">{time}</Text>
            <Icon name="chevronRight" color={colors.brand} size={18} />
          </View>
        </PressableScale>
      ) : null}
      {denied ? (
        <NotificationsOffRow testID="rewards-reminder-off" message={PROGRESS_COPY.reminderOff} />
      ) : null}
      <Sheet
        testID="rewards-reminder-sheet"
        visible={picking}
        onClose={() => setPicking(false)}
        title={PROGRESS_COPY.reminderTimeTitle}
      >
        <TimePicker
          testID="rewards-reminder-picker"
          value={{ hour: hour ?? 19, minute: minute ?? 30 }}
          onChange={(v) => update({ reminder: { time: `${pad(v.hour)}:${pad(v.minute)}` } })}
        />
      </Sheet>
    </View>
  );
}

export function RewardsSettingsScreen() {
  const enabled = useProgressEnabled();
  const { summary, isError, refetch } = useProgressSummary();
  const { update } = useUpdateProgressSettings();
  const actions = useFlameActions();
  const [choosingGoal, setChoosingGoal] = useState(false);
  const colors = useThemeColors();

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <ShellTopBar className="mx-4 mt-3" />
      {!enabled ? (
        <EmptyState testID="rewards-unavailable" title={PROGRESS_COPY.unavailable} />
      ) : isError && !summary ? (
        <ErrorState
          testID="rewards-error"
          title={PROGRESS_COPY.settingsLoadError}
          onRetry={refetch}
        />
      ) : !summary ? (
        <View testID="rewards-loading" className="gap-3 px-4 pt-4">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-52 w-full rounded-card" />
        </View>
      ) : (
        <KeyboardAwareScrollView
          testID="rewards-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        >
          <View className="gap-2 rounded-card border border-separator bg-surface p-4">
            <Text accessibilityRole="header" className="text-headline font-semibold text-label">
              {PROGRESS_COPY.celebrationsTitle}
            </Text>
            <SegmentedControl
              testID="rewards-celebrations"
              accessibilityLabel={PROGRESS_COPY.celebrationsTitle}
              options={CELEBRATION_OPTIONS}
              value={summary.settings.celebrations}
              onChange={(celebrations) => update({ celebrations })}
            />
            <Text className="text-subhead text-label-secondary">
              {PROGRESS_COPY.celebrationsOffNote}
            </Text>
          </View>

          <View className="rounded-card border border-separator bg-surface px-4 py-1">
            <ToggleRow
              testID="rewards-show-xp"
              title={PROGRESS_COPY.showXpTitle}
              body={PROGRESS_COPY.showXpBody}
              value={summary.settings.showXp}
              onChange={(showXp) => update({ showXp })}
            />
            <View className="h-px bg-separator" />
            <PressableScale
              testID="rewards-goal"
              accessibilityRole="button"
              accessibilityLabel={`${PROGRESS_COPY.goalTitle}, ${goalDaysLabel(summary.flame.goal)}`}
              onPress={() => setChoosingGoal(true)}
              className="min-h-14 flex-row items-center justify-between gap-3 py-2"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-headline font-semibold text-label">
                  {PROGRESS_COPY.goalTitle}
                </Text>
                <Text className="text-subhead text-label-secondary">{PROGRESS_COPY.goalBody}</Text>
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-brand-tint px-3 py-1.5">
                <Text className="text-callout font-bold text-brand">
                  {goalDaysLabel(summary.flame.goal)}
                </Text>
                <Icon name="chevronRight" color={colors.brand} size={16} />
              </View>
            </PressableScale>
            <View className="h-px bg-separator" />
            <ToggleRow
              testID="rewards-biscuit"
              title={PROGRESS_COPY.biscuitTitle}
              body={PROGRESS_COPY.biscuitBody}
              value={summary.settings.biscuit}
              onChange={(biscuit) => update({ biscuit })}
            />
            <View className="h-px bg-separator" />
            <ToggleRow
              testID="rewards-flame-on-today"
              title={PROGRESS_COPY.flameOnTodayTitle}
              body={PROGRESS_COPY.flameOnTodayBody}
              value={summary.settings.showFlameOnToday}
              onChange={(showFlameOnToday) => update({ showFlameOnToday })}
            />
          </View>

          <PauseCard flame={summary.flame} testID="rewards-pause" />

          <ReminderCard settings={summary.settings} />
        </KeyboardAwareScrollView>
      )}
      <SelectSheet
        testID="rewards-goal-sheet"
        visible={choosingGoal}
        onClose={() => setChoosingGoal(false)}
        title={PROGRESS_COPY.goalSheetTitle}
        options={GOAL_OPTIONS}
        value={summary ? String(summary.flame.goal) : null}
        onChange={(goal) => {
          setChoosingGoal(false);
          actions.setGoal(Number(goal));
        }}
      />
    </Screen>
  );
}
