import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, WeightUnit } from '@chefer/types';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Input,
  Screen,
  Sheet,
  Stepper,
  Text,
} from '@chefer/ui-mobile';
import {
  addDaysLocal,
  formatLoadNumber,
  kgToUnit,
  unitLabel,
  unitToKg,
  weekStartOf,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../offline/ids';
import { outbox, useOutboxStatus } from '../offline/outbox';
import { gymBootstrapQueryKey, useGymBootstrap } from '../use-gym-bootstrap';

// Gym settings (gym_plan.md §1.3 "Settings"). Every control saves immediately
// through gym.profile.save — no separate "Save changes" step, matching a
// typical mobile settings screen. See the KNOWN GAP note above `PauseSection`
// for the one control this screen intentionally does not wire up.

const PAUSE_REASONS = [
  { value: 'vacation' as const, label: 'Vacation' },
  { value: 'illness' as const, label: 'Illness' },
  { value: 'injury' as const, label: 'Injury' },
  { value: 'other' as const, label: 'Other' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function BackButton() {
  return (
    <Pressable
      testID="gym-settings-title-back"
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
      className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
    >
      <Ionicons name="chevron-back" size={22} color="#374151" />
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </Text>
  );
}

function WeightListEditor({
  testID,
  valuesKg,
  unit,
  onChangeKg,
}: {
  testID: string;
  valuesKg: number[];
  unit: WeightUnit;
  onChangeKg: (kg: number[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const sorted = [...valuesKg].sort((a, b) => a - b);

  const add = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      onChangeKg([...valuesKg, unitToKg(n, unit)]);
      setDraft('');
    }
  };

  return (
    <View className="gap-2">
      <View testID={testID} className="flex-row flex-wrap gap-2">
        {sorted.map((kg, i) => (
          <Pressable
            key={`${kg}-${i}`}
            testID={`${testID}-item-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${formatLoadNumber(kg, unit)} ${unitLabel(unit)}`}
            onPress={() => onChangeKg(valuesKg.filter((v) => v !== kg))}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border bg-background px-3"
          >
            <Text className="text-sm">
              {formatLoadNumber(kg, unit)} {unitLabel(unit)}
            </Text>
            <Text className="text-xs text-muted-foreground">✕</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Input
          testID={`${testID}-add-input`}
          keyboardType="decimal-pad"
          placeholder={`Add (${unitLabel(unit)})`}
          value={draft}
          onChangeText={setDraft}
          className="w-28"
        />
        <Button testID={`${testID}-add`} size="sm" variant="outline" onPress={add}>
          Add
        </Button>
      </View>
    </View>
  );
}

export function GymSettingsScreen() {
  const queryClient = useQueryClient();
  const { data: bootstrap } = useGymBootstrap();
  const outboxStatus = useOutboxStatus();
  const [pauseSheetVisible, setPauseSheetVisible] = useState(false);
  const [pauseWeeks, setPauseWeeks] = useState(1);
  const [pauseReason, setPauseReason] = useState<(typeof PAUSE_REASONS)[number]['value'] | null>(
    null,
  );
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);
  // Hooks run unconditionally (before the "no profile yet" early return), so
  // these read the reminder time via optional chaining rather than after a
  // `bootstrap.profile` guard.
  const [reminderHour, setReminderHour] = useState(() =>
    bootstrap?.profile?.reminderTime ? Number(bootstrap.profile.reminderTime.split(':')[0]) : 7,
  );
  const [reminderMinute, setReminderMinute] = useState(() =>
    bootstrap?.profile?.reminderTime ? Number(bootstrap.profile.reminderTime.split(':')[1]) : 0,
  );

  const saveMutation = trpc.gym.profile.save.useMutation({
    onSuccess: (profile) =>
      queryClient.setQueryData(gymBootstrapQueryKey, (prev: GymBootstrap | undefined) =>
        prev ? { ...prev, profile } : prev,
      ),
  });
  const pauseCreateMutation = trpc.gym.pause.create.useMutation({
    onSuccess: () => {
      setPauseSheetVisible(false);
      void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
    },
  });

  if (!bootstrap?.profile) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-row items-center gap-3 px-4 pt-2">
          <BackButton />
          <Text testID="gym-settings-title" variant="title">
            Gym settings
          </Text>
        </View>
        <EmptyState
          testID="gym-settings-empty"
          title="Set up your training first"
          description="Gym settings appear once you've completed setup."
        />
      </Screen>
    );
  }

  const { profile } = bootstrap;
  const unit = profile.unit;
  const today = localDate();
  const isPausedThisWeek = bootstrap.weeks.some(
    (w) => w.weekStart === weekStartOf(today) && w.status === 'paused',
  );

  const saveReminder = (enabled: boolean, hour: number, minute: number) => {
    saveMutation.mutate({
      reminderEnabled: enabled,
      reminderTime: enabled ? `${pad(hour)}:${pad(minute)}` : null,
    });
  };

  const confirmPause = () => {
    const startDate = today;
    const endDate = addDaysLocal(startDate, pauseWeeks * 7 - 1);
    pauseCreateMutation.mutate({ startDate, endDate, reason: pauseReason });
  };

  const retryParked = (id: string) => void outbox.retryParked(id);
  const discardParked = (id: string) => {
    outbox.discardParked(id);
    setConfirmingDiscardId(null);
  };

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-3 px-4 pt-2">
        <BackButton />
        <Text testID="gym-settings-title" variant="title">
          Gym settings
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-5 px-4 py-4" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <SectionTitle>Units</SectionTitle>
          <ChipGroup
            testID="gym-settings-unit"
            options={[
              { value: 'KG' as const, label: 'kg', testID: 'gym-settings-unit-kg' },
              { value: 'LB' as const, label: 'lb', testID: 'gym-settings-unit-lb' },
            ]}
            value={[unit]}
            onChange={(v) => {
              const next = v[0];
              if (next) saveMutation.mutate({ unit: next });
            }}
          />
        </View>

        <View className="gap-2">
          <SectionTitle>Weekly goal</SectionTitle>
          <Stepper
            testID="gym-settings-weekly-goal"
            accessibilityLabel="Weekly goal"
            value={profile.weeklyGoal}
            min={1}
            max={7}
            label="sessions / week"
            onChange={(n) => saveMutation.mutate({ weeklyGoal: n })}
          />
        </View>

        <View className="gap-3">
          <SectionTitle>Equipment</SectionTitle>
          <Card className="gap-4">
            <View className="gap-2">
              <Text variant="label">Bar weight</Text>
              <Stepper
                testID="gym-settings-bar-weight"
                accessibilityLabel="Bar weight"
                value={kgToUnit(profile.barWeightKg, unit)}
                step={unit === 'KG' ? 0.5 : 1}
                min={0}
                max={60}
                format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                onChange={(v) => saveMutation.mutate({ barWeightKg: unitToKg(v, unit) })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Plate pairs you have</Text>
              <WeightListEditor
                testID="gym-settings-plates"
                valuesKg={profile.platePairsKg}
                unit={unit}
                onChangeKg={(kg) => saveMutation.mutate({ platePairsKg: kg })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Dumbbells you have</Text>
              <WeightListEditor
                testID="gym-settings-dumbbells"
                valuesKg={profile.dumbbellsKg}
                unit={unit}
                onChangeKg={(kg) => saveMutation.mutate({ dumbbellsKg: kg })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Machine weight step</Text>
              <Stepper
                testID="gym-settings-machine-step"
                accessibilityLabel="Machine weight step"
                value={kgToUnit(profile.machineStepKg, unit)}
                step={unit === 'KG' ? 0.5 : 1}
                min={0.5}
                max={20}
                format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                onChange={(v) => saveMutation.mutate({ machineStepKg: unitToKg(v, unit) })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Cable weight step</Text>
              <Stepper
                testID="gym-settings-cable-step"
                accessibilityLabel="Cable weight step"
                value={kgToUnit(profile.cableStepKg, unit)}
                step={unit === 'KG' ? 0.5 : 1}
                min={0.5}
                max={20}
                format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                onChange={(v) => saveMutation.mutate({ cableStepKg: unitToKg(v, unit) })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Dip belt</Text>
              <ChipGroup
                testID="gym-settings-dip-belt"
                options={[
                  { value: 'no' as const, label: 'No', testID: 'gym-settings-dip-belt-no' },
                  { value: 'yes' as const, label: 'Yes', testID: 'gym-settings-dip-belt-yes' },
                ]}
                value={[profile.hasDipBelt ? 'yes' : 'no']}
                onChange={(v) => saveMutation.mutate({ hasDipBelt: v[0] === 'yes' })}
              />
            </View>
            <View className="gap-2">
              <Text variant="label">Micro plates</Text>
              <ChipGroup
                testID="gym-settings-micro-plates"
                options={[
                  { value: 'no' as const, label: 'No', testID: 'gym-settings-micro-plates-no' },
                  { value: 'yes' as const, label: 'Yes', testID: 'gym-settings-micro-plates-yes' },
                ]}
                value={[profile.microPlates ? 'yes' : 'no']}
                onChange={(v) => saveMutation.mutate({ microPlates: v[0] === 'yes' })}
              />
            </View>
          </Card>
        </View>

        <View className="gap-2">
          <SectionTitle>Reminder</SectionTitle>
          <Card className="gap-3">
            <ChipGroup
              testID="gym-settings-reminder-toggle"
              options={[
                { value: 'off' as const, label: 'Off', testID: 'gym-settings-reminder-off' },
                { value: 'on' as const, label: 'On', testID: 'gym-settings-reminder-on' },
              ]}
              value={[profile.reminderEnabled ? 'on' : 'off']}
              onChange={(v) => saveReminder(v[0] === 'on', reminderHour, reminderMinute)}
            />
            {profile.reminderEnabled && (
              <View className="flex-row items-center gap-3">
                <Stepper
                  testID="gym-settings-reminder-hour"
                  accessibilityLabel="Reminder hour"
                  value={reminderHour}
                  min={0}
                  max={23}
                  format={(v) => pad(v)}
                  onChange={(v) => {
                    setReminderHour(v);
                    saveReminder(true, v, reminderMinute);
                  }}
                />
                <Text className="text-lg font-semibold">:</Text>
                <Stepper
                  testID="gym-settings-reminder-minute"
                  accessibilityLabel="Reminder minute"
                  value={reminderMinute}
                  step={15}
                  min={0}
                  max={45}
                  format={(v) => pad(v)}
                  onChange={(v) => {
                    setReminderMinute(v);
                    saveReminder(true, reminderHour, v);
                  }}
                />
              </View>
            )}
          </Card>
        </View>

        <View className="gap-2">
          <SectionTitle>Pause training</SectionTitle>
          <Card className="gap-2">
            {isPausedThisWeek ? (
              // KNOWN GAP: GymBootstrap/GymProfileDto carry no active-pause id
              // (packages/types/src/gym/{dto,schemas}.ts are frozen — G2-B
              // cannot add one), so "end a pause early" has nothing to call
              // pause.end with. Flagged in the handoff for a follow-up DTO change.
              <Text testID="gym-settings-paused-note" variant="muted">
                Training is paused this week.
              </Text>
            ) : (
              <Button
                testID="gym-settings-pause-start"
                variant="outline"
                onPress={() => setPauseSheetVisible(true)}
              >
                Pause training
              </Button>
            )}
          </Card>
        </View>

        {outboxStatus.parked.length > 0 && (
          <View className="gap-2">
            <SectionTitle>Needs attention</SectionTitle>
            <View className="gap-2">
              {outboxStatus.parked.map((entry) => (
                <Card
                  key={entry.doc.id}
                  testID={`gym-settings-parked-${entry.doc.id}`}
                  className="gap-2"
                >
                  <Text className="font-medium">{entry.doc.name}</Text>
                  <Text variant="muted" className="text-xs">
                    {entry.doc.localDate} · {entry.parkedReason ?? entry.lastError ?? 'Rejected'}
                  </Text>
                  {confirmingDiscardId === entry.doc.id ? (
                    <View className="gap-2">
                      <Text className="text-sm text-red-600">This workout will be lost.</Text>
                      <View className="flex-row gap-2">
                        <Button
                          testID={`gym-settings-parked-${entry.doc.id}-discard-confirm`}
                          size="sm"
                          variant="destructive"
                          onPress={() => discardParked(entry.doc.id)}
                        >
                          Discard
                        </Button>
                        <Button
                          testID={`gym-settings-parked-${entry.doc.id}-discard-cancel`}
                          size="sm"
                          variant="outline"
                          onPress={() => setConfirmingDiscardId(null)}
                        >
                          Cancel
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      <Button
                        testID={`gym-settings-parked-${entry.doc.id}-retry`}
                        size="sm"
                        onPress={() => retryParked(entry.doc.id)}
                      >
                        Retry
                      </Button>
                      <Button
                        testID={`gym-settings-parked-${entry.doc.id}-discard`}
                        size="sm"
                        variant="outline"
                        onPress={() => setConfirmingDiscardId(entry.doc.id)}
                      >
                        Discard
                      </Button>
                    </View>
                  )}
                </Card>
              ))}
            </View>
          </View>
        )}

        <View className="gap-1">
          <SectionTitle>Last sync</SectionTitle>
          <Text testID="gym-settings-last-sync" variant="muted">
            {outboxStatus.lastSyncAt ? new Date(outboxStatus.lastSyncAt).toLocaleString() : 'Never'}
          </Text>
        </View>
      </ScrollView>

      <Sheet
        visible={pauseSheetVisible}
        onClose={() => setPauseSheetVisible(false)}
        title="Pause training"
        testID="gym-settings-pause-sheet"
        footer={
          <Button
            testID="gym-settings-pause-confirm"
            loading={pauseCreateMutation.isPending}
            onPress={confirmPause}
          >
            Pause
          </Button>
        }
      >
        <View className="gap-2">
          <Text variant="label">How many weeks?</Text>
          <Stepper
            testID="gym-settings-pause-weeks"
            accessibilityLabel="Pause weeks"
            value={pauseWeeks}
            min={1}
            max={4}
            label="weeks"
            onChange={setPauseWeeks}
          />
        </View>
        <View className="gap-2">
          <Text variant="label">Reason (optional)</Text>
          <ChipGroup
            testID="gym-settings-pause-reason"
            options={PAUSE_REASONS.map((r) => ({
              ...r,
              testID: `gym-settings-pause-reason-${r.value}`,
            }))}
            value={pauseReason ? [pauseReason] : []}
            allowEmpty
            onChange={(v) => setPauseReason(v[0] ?? null)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
