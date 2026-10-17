import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { DistanceUnit, WeightUnit } from '@chefer/types';
import {
  Button,
  EmptyState,
  IconButton,
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  Screen,
  SegmentedControl,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { pauseSummaryLine, weekStartOf, WELLNESS_COPY } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import { useNotificationPermission } from '../../../lib/use-notification-permission';
import {
  GymBootstrapUnavailable,
  useGymBootstrapLoad,
} from '../../gym/components/gym-bootstrap-state';
import { OutboxWaitingCard } from '../../gym/components/outbox-waiting-card';
import { localDate } from '../../gym/offline/ids';
import { outbox, useOutboxStatus, type OutboxStatus } from '../../gym/offline/outbox';
import { GymSettingsScreen, type GymSettingsPart } from '../../gym/settings/settings-screen';
import { useGymBootstrap } from '../../gym/use-gym-bootstrap';
import { useSaveGymProfile } from '../../gym/use-save-gym-profile';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import {
  equipmentSummary,
  sessionLengthValue,
  trainingDaysSummary,
} from './training-settings-summary';

// ─── Training settings (10 Oct redesign, GymSettings board) ──────────────────
// The new shell's `/gym/settings`: one overview — Basics (units + weekly goal,
// edited in place), "Your setup" rows with a summary each, and Data (pause,
// export). Every row opens the legacy section it summarises as its own pushed
// page (`/gym/settings?section=<part>` → `GymSettingsScreen part=…`), so the
// detailed editors keep every legacy behaviour (immediate saves, permission
// prompt, pause sheet, large-export confirm). The old shell is untouched.

const PART_TITLES: Record<GymSettingsPart, string> = {
  equipment: 'Equipment',
  days: 'Training days',
  reminders: 'Reminders',
  session: 'Session length',
  pause: 'Pause training',
  export: 'Export workouts',
};

/** `?section=` → the part it opens. `units` (and unknown ids) land on the overview. */
export function trainingSettingsPart(section: string | null | undefined): GymSettingsPart | null {
  return section && Object.prototype.hasOwnProperty.call(PART_TITLES, section)
    ? (section as GymSettingsPart)
    : null;
}

function openPart(part: GymSettingsPart) {
  router.push(`/gym/settings?section=${part}`);
}

/** The route's new-shell render: the overview, or one section's page. */
export function TrainingSettingsRoute() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const part = trainingSettingsPart(section);
  return part ? <TrainingSettingsPartScreen part={part} /> : <TrainingSettingsScreen />;
}

/** One legacy section on its own pushed page, under the shell's top bar. */
export function TrainingSettingsPartScreen({ part }: { part: GymSettingsPart }) {
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/gym/settings', title: PART_TITLES[part] }}
    >
      <GymSettingsScreen
        part={part}
        header={
          <View className="px-4">
            <ShellTopBar />
          </View>
        }
      />
    </ShellChromeProvider>
  );
}

export function TrainingSettingsScreen() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/you', title: 'Training settings' }}>
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAwareScrollView
          testID="training-settings-scroll"
          contentContainerClassName="gap-6 px-4 pb-8"
        >
          <ShellTopBar />
          <TrainingSettingsBody />
        </KeyboardAwareScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-4 text-subhead font-semibold text-label-secondary"
    >
      {children}
    </Text>
  );
}

function BasicsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-11 flex-row items-center gap-3 py-2.5">
      <Text className="min-w-0 flex-1 text-body text-label">{label}</Text>
      {children}
    </View>
  );
}

function Hairline() {
  return <View className="-mx-4 h-px bg-separator" />;
}

function TrainingSettingsBody() {
  const colors = useThemeColors();
  const bootstrapQuery = useGymBootstrap();
  const { data: bootstrap } = bootstrapQuery;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const { cardioLogging } = useFlags();
  const outboxStatus = useOutboxStatus();
  // Same optimistic save as the legacy screen (UX-GYM-22).
  const saveMutation = useSaveGymProfile();
  const dayKindsQuery = trpc.training.getDayKinds.useQuery();
  const notificationPermission = useNotificationPermission();

  if (bootstrapLoad.load !== 'data') {
    // UX-GYM-24: a failed or offline first load is not "set up your training".
    return (
      <GymBootstrapUnavailable
        load={bootstrapLoad.load}
        onRetry={bootstrapLoad.retry}
        testID="training-settings"
        what="your training settings"
      />
    );
  }
  if (!bootstrap?.profile) {
    return (
      <EmptyState
        testID="training-settings-empty"
        title="Set up your training first"
        description="Training settings appear once you've completed setup."
        action={{
          label: 'Set up training',
          testID: 'training-settings-setup-cta',
          onPress: () => router.push('/gym/setup'),
        }}
      />
    );
  }

  const { profile } = bootstrap;
  const unit = profile.unit;
  // T-42.3: null/absent derives from `unit` — MI when LB, else KM.
  const distanceUnit = profile.distanceUnit ?? (unit === 'LB' ? 'MI' : 'KM');
  const weeklyGoal = profile.weeklyGoal;
  const today = localDate();
  const liftWeekdays = new Set(
    (bootstrap.activeRoutine?.days ?? [])
      .map((d) => d.plannedWeekday)
      .filter((w): w is number => w !== null),
  );
  // The OS answer beats the saved preference: denied means reminders are Off.
  const remindersOn = profile.reminderEnabled && notificationPermission !== 'denied';
  const shownPause = bootstrap.activePause ?? bootstrap.upcomingPause ?? null;
  const isPausedThisWeek = bootstrap.weeks.some(
    (w) => w.weekStart === weekStartOf(today) && w.status === 'paused',
  );
  const pauseLine = shownPause
    ? pauseSummaryLine(shownPause, today)
    : isPausedThisWeek
      ? 'Training is paused this week.'
      : undefined;
  const setGoal = (n: number) => saveMutation.mutate({ weeklyGoal: Math.min(7, Math.max(1, n)) });

  return (
    <>
      {outboxStatus.parked.length > 0 ? <ParkedSessions parked={outboxStatus.parked} /> : null}
      <OutboxWaitingCard status={outboxStatus} testID="training-settings-outbox" />

      <View className="gap-1.5" testID="training-settings-basics">
        <GroupTitle>Basics</GroupTitle>
        <View className="rounded-card border border-separator bg-surface px-4">
          <BasicsRow label="Weight">
            <SegmentedControl<WeightUnit>
              testID="training-settings-unit"
              accessibilityLabel="Weight unit"
              size="sm"
              className="w-36"
              options={[
                { value: 'KG', label: 'kg', testID: 'training-settings-unit-kg' },
                { value: 'LB', label: 'lb', testID: 'training-settings-unit-lb' },
              ]}
              value={unit}
              onChange={(next) => saveMutation.mutate({ unit: next })}
            />
          </BasicsRow>
          {cardioLogging ? (
            <>
              <Hairline />
              <BasicsRow label="Distance">
                <SegmentedControl<DistanceUnit>
                  testID="training-settings-distance-unit"
                  accessibilityLabel="Distance unit"
                  size="sm"
                  className="w-36"
                  options={[
                    { value: 'KM', label: 'km', testID: 'training-settings-distance-unit-km' },
                    { value: 'MI', label: 'mi', testID: 'training-settings-distance-unit-mi' },
                  ]}
                  value={distanceUnit}
                  onChange={(next) => saveMutation.mutate({ distanceUnit: next })}
                />
              </BasicsRow>
            </>
          ) : null}
          <Hairline />
          <BasicsRow label="Workouts a week">
            <View className="flex-row items-center gap-1.5">
              <IconButton
                testID="training-settings-weekly-goal-dec"
                accessibilityLabel="Fewer workouts a week"
                icon={<Icon name="remove" color={colors.labelSecondary} />}
                disabled={weeklyGoal <= 1}
                onPress={() => setGoal(weeklyGoal - 1)}
                className="bg-surface-sunken"
              />
              <Text
                testID="training-settings-weekly-goal-value"
                accessibilityLabel={`${String(weeklyGoal)} workouts a week`}
                className="min-w-7 text-center text-headline font-semibold text-label"
              >
                {String(weeklyGoal)}
              </Text>
              <IconButton
                testID="training-settings-weekly-goal-inc"
                accessibilityLabel="More workouts a week"
                icon={<Icon name="add" color={colors.labelSecondary} />}
                disabled={weeklyGoal >= 7}
                onPress={() => setGoal(weeklyGoal + 1)}
                className="bg-surface-sunken"
              />
            </View>
          </BasicsRow>
        </View>
        <Text className="px-4 text-caption text-label-tertiary">
          Weight also switches recipes, shopping lists and your body weight.
        </Text>
      </View>

      <ListSection title="Your setup" testID="training-settings-setup">
        <ListRow
          testID="training-settings-equipment"
          title="Equipment"
          subtitle={equipmentSummary(profile)}
          icon={<Icon name="barbell" color={colors.brand} />}
          onPress={() => openPart('equipment')}
        />
        <ListRow
          testID="training-settings-days"
          title="Training days"
          subtitle={trainingDaysSummary(liftWeekdays, dayKindsQuery.data ?? {})}
          icon={<Icon name="calendar" color={colors.brand} />}
          onPress={() => openPart('days')}
        />
        <ListRow
          testID="training-settings-reminders"
          title="Reminders"
          value={remindersOn ? (profile.reminderTime ?? 'On') : 'Off'}
          icon={<Icon name="notifications" color={colors.brand} />}
          onPress={() => openPart('reminders')}
        />
        <ListRow
          testID="training-settings-session"
          title="Session length"
          value={sessionLengthValue(profile.sessionLengthMins)}
          icon={<Icon name="time" color={colors.brand} />}
          onPress={() => openPart('session')}
        />
      </ListSection>

      <ListSection title="Data" testID="training-settings-data">
        <ListRow
          testID="training-settings-pause"
          title="Pause training"
          subtitle={pauseLine}
          icon={<Icon name="timer" color={colors.brand} />}
          onPress={() => openPart('pause')}
        />
        <ListRow
          testID="training-settings-export"
          title="Export workouts"
          value="CSV"
          icon={<Icon name="share" color={colors.brand} />}
          onPress={() => openPart('export')}
        />
      </ListSection>

      <View className="gap-2 px-4">
        {outboxStatus.lastSyncAt ? (
          <Text testID="training-settings-last-sync" className="text-caption text-label-tertiary">
            {`Last synced ${new Date(outboxStatus.lastSyncAt).toLocaleString()}`}
          </Text>
        ) : null}
        {/* Advisory disclaimer (2026-10-02), always visible on gym settings. */}
        <Text
          testID="training-settings-advisory-disclaimer"
          className="text-caption text-label-tertiary"
        >
          {WELLNESS_COPY.gymAdvisoryDisclaimer}
        </Text>
      </View>
    </>
  );
}

/** Workouts the server refused (parked in the outbox): retry, or discard after a confirm. */
function ParkedSessions({ parked }: { parked: OutboxStatus['parked'] }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <View className="gap-1.5" testID="training-settings-parked">
      <GroupTitle>Needs attention</GroupTitle>
      {parked.map((entry) => {
        const id = entry.doc.id;
        return (
          <View
            key={id}
            testID={`training-settings-parked-${id}`}
            className="gap-2 rounded-card border border-separator bg-surface p-4"
          >
            <Text className="text-body font-semibold text-label">{entry.doc.name}</Text>
            <Text className="text-caption text-label-secondary">
              {`${entry.doc.localDate} · ${entry.parkedReason ?? entry.lastError ?? 'Rejected'}`}
            </Text>
            {confirmingId === id ? (
              <>
                <Text className="text-subhead text-danger">This workout will be lost.</Text>
                <View className="flex-row gap-2">
                  <Button
                    testID={`training-settings-parked-${id}-discard-confirm`}
                    size="sm"
                    variant="destructive"
                    onPress={() => {
                      outbox.discardParked(id);
                      setConfirmingId(null);
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    testID={`training-settings-parked-${id}-discard-cancel`}
                    size="sm"
                    variant="outline"
                    onPress={() => setConfirmingId(null)}
                  >
                    Cancel
                  </Button>
                </View>
              </>
            ) : (
              <View className="flex-row gap-2">
                <Button
                  testID={`training-settings-parked-${id}-retry`}
                  size="sm"
                  onPress={() => void outbox.retryParked(id)}
                >
                  Retry
                </Button>
                <Button
                  testID={`training-settings-parked-${id}-discard`}
                  size="sm"
                  variant="outline"
                  onPress={() => setConfirmingId(id)}
                >
                  Discard
                </Button>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
