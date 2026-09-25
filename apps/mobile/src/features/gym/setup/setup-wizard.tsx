import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type {
  GymEquipmentAccess,
  TrainingExperience,
  VolumeGroup,
  WeightUnit,
} from '@chefer/types';
import {
  Button,
  Card,
  ChipGroup,
  Input,
  KeyboardAwareScrollView,
  NumericReturnBar,
  Screen,
  Sheet,
  Stepper,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { cn, unitLabel, unitToKg, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { ensureGymReminderPermission } from '../reminders/permission';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { defaultUnitFromLocale } from './locale-unit';
import { buildTemplatePreview, uniqueExercisesOf, type TemplatePreview } from './template-preview';

// Gym setup (gym_plan.md §1.3 "Setup", programming-research §3.5). A 7-step
// stepper with progress dots ending in `profile.completeSetup`. The preview
// (step 5) uses profile.recommend for the recommendation + alternatives list
// (also the "needs a connection" gate), then renders day-by-day content with
// the pure, shared engine (template-preview.ts) so switching between
// alternatives never needs another round trip.

const TOTAL_STEPS = 7;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEIGHTS_ACCESSORY_ID = 'gym-setup-weights-return';

function ProgressDots({ step }: { step: number }) {
  return (
    <View
      testID="gym-setup-progress"
      accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}
      className="flex-row items-center justify-center gap-2 py-1"
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
        <View
          key={n}
          className={cn(
            'h-2 w-2 rounded-full',
            n === step ? 'bg-primary' : n < step ? 'bg-primary/40' : 'bg-muted',
          )}
        />
      ))}
    </View>
  );
}

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <View className="gap-1.5">
      {/* Stable testID across every step (gym-mode.flow.yaml anchors on it to
          detect "setup opened on top of Today", same contract the G1-C
          placeholder shipped). */}
      <Text testID="gym-setup-title" variant="title">
        {title}
      </Text>
      <Text variant="muted">{description}</Text>
    </View>
  );
}

export function SetupWizard() {
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [days, setDays] = useState(3);
  const [experience, setExperience] = useState<TrainingExperience>('BEGINNER');
  const [equipmentAccess, setEquipmentAccess] = useState<GymEquipmentAccess>('FULL_GYM');
  const [unit, setUnit] = useState<WeightUnit>(() => defaultUnitFromLocale());
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(7);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [weightsChoice, setWeightsChoice] = useState<'help' | 'know' | null>(null);
  const [knownWeights, setKnownWeights] = useState<Record<string, string>>({});

  // Changing any recommend input invalidates a picked alternative and any
  // weight guesses already typed for the old routine's exercises.
  const resetForNewRecommendation = () => {
    setOverrideKey(null);
    setWeightsChoice(null);
    setKnownWeights({});
  };

  const recommendInput = useMemo(
    () => ({ days, experience, equipmentAccess }),
    [days, experience, equipmentAccess],
  );
  const recommendQuery = trpc.gym.profile.recommend.useQuery(recommendInput, {
    enabled: step >= 5,
    staleTime: Infinity,
    retry: false,
  });

  const templateKey = overrideKey ?? recommendQuery.data?.recommendedKey ?? null;
  const isRecommended = templateKey !== null && templateKey === recommendQuery.data?.recommendedKey;

  const preview: TemplatePreview | null = useMemo(() => {
    if (!templateKey) return null;
    try {
      return buildTemplatePreview(templateKey, equipmentAccess, experience);
    } catch {
      return null;
    }
  }, [templateKey, equipmentAccess, experience]);

  const whyText = isRecommended
    ? recommendQuery.data?.reason
    : recommendQuery.data?.alternatives.find((t) => t.key === templateKey)?.description;

  const exercises = useMemo(() => (preview ? uniqueExercisesOf(preview) : []), [preview]);

  // Starting weights (dogfood #2): the keyboard used to cover whichever
  // field you were typing into. `decimal-pad` has no Return key on iOS, so
  // `WEIGHTS_ACCESSORY_ID` pairs every field here with one shared
  // NumericReturnBar for "Next" / "Done"; on Android the IME already renders
  // one for `returnKeyType`, and `inputAccessoryViewID` is simply ignored.
  const weightsChain = useFieldChain(exercises.length);
  const scrollFieldIntoView = useScrollFieldIntoView();

  useEffect(() => {
    if (step === 6 && weightsChoice === null) {
      setWeightsChoice(experience === 'INTERMEDIATE' ? 'know' : 'help');
    }
  }, [step, weightsChoice, experience]);

  const completeSetupMutation = trpc.gym.profile.completeSetup.useMutation({
    onSuccess: (bootstrap) => {
      queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
      router.replace('/today');
    },
  });

  const goBack = () => {
    if (completeSetupMutation.isPending) return;
    if (step === 1) {
      if (router.canGoBack()) router.back();
      else router.replace('/today');
      return;
    }
    setStep((s) => s - 1);
  };

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  const handleFinish = () => {
    if (!templateKey || completeSetupMutation.isPending) return;
    const knownWeightsKg: Record<string, number> = {};
    if (weightsChoice === 'know') {
      for (const [exerciseId, raw] of Object.entries(knownWeights)) {
        const value = parseFloat(raw.replace(',', '.'));
        if (Number.isFinite(value) && value > 0) {
          knownWeightsKg[exerciseId] = unitToKg(value, unit);
        }
      }
    }
    const reminderTime = reminderEnabled
      ? `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`
      : null;
    completeSetupMutation.mutate({
      days,
      experience,
      equipmentAccess,
      unit,
      templateKey,
      plannedWeekdays: [...weekdays].sort((a, b) => a - b),
      reminderTime,
      ...(weightsChoice === 'know' && Object.keys(knownWeightsKg).length > 0
        ? { knownWeightsKg }
        : {}),
    });
  };

  const canGoNext = step === 5 ? preview !== null : true;

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-3 px-4 pt-2">
        <Pressable
          testID="gym-setup-title-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
        >
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </Pressable>
        <View className="flex-1">
          <ProgressDots step={step} />
        </View>
        <View className="w-11" />
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="gap-5 px-4 py-4"
        footer={
          <View className="gap-2 border-t border-border px-4 pb-2 pt-3">
            {step === 4 && (
              <Button variant="ghost" testID="gym-setup-skip" onPress={goNext}>
                Skip
              </Button>
            )}
            {step < 7 ? (
              <Button testID="gym-setup-next" disabled={!canGoNext} onPress={goNext}>
                Next
              </Button>
            ) : (
              <Button
                testID="gym-setup-finish"
                loading={completeSetupMutation.isPending}
                disabled={!templateKey}
                onPress={handleFinish}
              >
                Start training
              </Button>
            )}
          </View>
        }
      >
        {step === 1 && (
          <View className="gap-5">
            <StepHeader
              title="How many days a week can you train?"
              description="Pick what you can keep up on a busy week. Consistency beats ambition."
            />
            <ChipGroup
              testID="gym-setup-days"
              options={[2, 3, 4, 5, 6].map((n) => ({
                value: n,
                label: String(n),
                testID: `gym-setup-days-${n}`,
              }))}
              value={[days]}
              onChange={(v) => {
                const next = v[0];
                if (next !== undefined) {
                  setDays(next);
                  resetForNewRecommendation();
                }
              }}
            />
          </View>
        )}

        {step === 2 && (
          <View className="gap-5">
            <StepHeader
              title="How much lifting experience do you have?"
              description="This tunes your starting weights and how fast the program moves."
            />
            <ChipGroup
              testID="gym-setup-experience"
              options={[
                {
                  value: 'BEGINNER' as const,
                  label: 'New or returning',
                  testID: 'gym-setup-experience-beginner',
                },
                {
                  value: 'INTERMEDIATE' as const,
                  label: 'Experienced',
                  testID: 'gym-setup-experience-intermediate',
                },
              ]}
              value={[experience]}
              onChange={(v) => {
                const next = v[0];
                if (next) {
                  setExperience(next);
                  resetForNewRecommendation();
                }
              }}
            />
            <Text variant="muted" className="text-xs">
              &quot;New or returning&quot; means under 6 months of consistent lifting.
            </Text>
          </View>
        )}

        {step === 3 && (
          <View className="gap-6">
            <StepHeader
              title="What equipment do you have?"
              description="A commercial gym gets the most out of the program."
            />
            <ChipGroup
              testID="gym-setup-equipment"
              options={[
                {
                  value: 'FULL_GYM' as const,
                  label: 'Full gym',
                  testID: 'gym-setup-equipment-full_gym',
                },
                {
                  value: 'DUMBBELLS' as const,
                  label: 'Dumbbells + bench',
                  testID: 'gym-setup-equipment-dumbbells',
                },
                {
                  value: 'BODYWEIGHT' as const,
                  label: 'Bodyweight',
                  testID: 'gym-setup-equipment-bodyweight',
                },
              ]}
              value={[equipmentAccess]}
              onChange={(v) => {
                const next = v[0];
                if (next) {
                  setEquipmentAccess(next);
                  resetForNewRecommendation();
                }
              }}
            />
            <View className="gap-2">
              <Text variant="label">Units</Text>
              <ChipGroup
                testID="gym-setup-unit"
                options={[
                  { value: 'KG' as const, label: 'kg', testID: 'gym-setup-unit-kg' },
                  { value: 'LB' as const, label: 'lb', testID: 'gym-setup-unit-lb' },
                ]}
                value={[unit]}
                onChange={(v) => {
                  const next = v[0];
                  if (next) setUnit(next);
                }}
              />
            </View>
          </View>
        )}

        {step === 4 && (
          <View className="gap-6">
            <StepHeader
              title="Which days, roughly?"
              description="Used for your week strip and reminders. You can skip this and decide later."
            />
            <ChipGroup
              testID="gym-setup-weekdays"
              multiple
              options={WEEKDAY_LABELS.map((label, i) => ({
                value: i,
                label,
                testID: `gym-setup-weekday-${i}`,
              }))}
              value={weekdays}
              onChange={setWeekdays}
            />
            <View className="gap-2">
              <ChipGroup
                testID="gym-setup-reminder-toggle"
                options={[
                  { value: 'off' as const, label: 'No reminder', testID: 'gym-setup-reminder-off' },
                  { value: 'on' as const, label: 'Remind me', testID: 'gym-setup-reminder-on' },
                ]}
                value={[reminderEnabled ? 'on' : 'off']}
                onChange={(v) => {
                  const enabled = v[0] === 'on';
                  setReminderEnabled(enabled);
                  // "Want a reminder?" is a direct user action — ask here,
                  // never on cold start (gym_plan.md §6.5).
                  if (enabled) void ensureGymReminderPermission();
                }}
              />
              {reminderEnabled && (
                <View className="flex-row items-center gap-3">
                  <Stepper
                    testID="gym-setup-reminder-hour"
                    accessibilityLabel="Reminder hour"
                    value={reminderHour}
                    min={0}
                    max={23}
                    format={(v) => String(v).padStart(2, '0')}
                    onChange={setReminderHour}
                    label="hour"
                  />
                  <Text className="text-lg font-semibold">:</Text>
                  <Stepper
                    testID="gym-setup-reminder-minute"
                    accessibilityLabel="Reminder minute"
                    value={reminderMinute}
                    step={15}
                    min={0}
                    max={45}
                    format={(v) => String(v).padStart(2, '0')}
                    onChange={setReminderMinute}
                    label="min"
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {step === 5 && (
          <View className="gap-4" testID="gym-setup-preview">
            <StepHeader
              title="Your program"
              description="Editable later — this is just the start."
            />
            {recommendQuery.isLoading && (
              <Text variant="muted" testID="gym-setup-preview-loading">
                Finding your program…
              </Text>
            )}
            {recommendQuery.isError && (
              <Card className="gap-3">
                <Text testID="gym-setup-preview-offline" className="font-medium">
                  Setup needs a connection.
                </Text>
                <Text variant="muted">Reconnect and try again.</Text>
                <Button
                  testID="gym-setup-preview-retry"
                  onPress={() => void recommendQuery.refetch()}
                >
                  Try again
                </Button>
              </Card>
            )}
            {preview && (
              <>
                <Card className="gap-2">
                  <Text className="font-semibold">{preview.name}</Text>
                  {whyText && (
                    <Text testID="gym-setup-why" variant="muted">
                      {whyText}
                    </Text>
                  )}
                </Card>
                <View className="gap-3">
                  {preview.days.map((day, i) => (
                    <Card
                      key={`${day.name}-${i}`}
                      testID={`gym-setup-preview-day-${i}`}
                      className="gap-2"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="font-semibold">{day.name}</Text>
                        <Text variant="muted" className="text-xs">
                          ~{day.estimatedMin} min
                        </Text>
                      </View>
                      {day.exercises.map((ex) => (
                        <View key={ex.exerciseId} className="flex-row items-center justify-between">
                          <Text numberOfLines={1} className="min-w-0 flex-1 pr-2 text-sm">
                            {ex.name}
                          </Text>
                          <Text variant="muted" className="text-xs">
                            {ex.sets} ×{' '}
                            {ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}-${ex.repMax}`}
                          </Text>
                        </View>
                      ))}
                    </Card>
                  ))}
                </View>
                <Card className="gap-2" testID="gym-setup-volume">
                  <Text className="font-semibold">Weekly balance</Text>
                  {preview.volume.map((v) => {
                    const pct = Math.min(100, (v.fractional / Math.max(1, v.productiveMax)) * 100);
                    return (
                      <View key={v.group} className="gap-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs">
                            {VOLUME_GROUP_LABELS[v.group as VolumeGroup]}
                          </Text>
                          <Text variant="muted" className="text-xs">
                            {v.fractional} sets
                          </Text>
                        </View>
                        <View className="h-1.5 rounded-full bg-muted">
                          <View
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Card>
                <Button
                  variant="outline"
                  testID="gym-setup-choose-alt"
                  onPress={() => setShowAlternatives(true)}
                >
                  Choose another program
                </Button>
              </>
            )}
            <Sheet
              visible={showAlternatives}
              onClose={() => setShowAlternatives(false)}
              title="Other programs"
              testID="gym-setup-alternatives"
            >
              {recommendQuery.data?.alternatives.map((t) => (
                <Pressable
                  key={t.key}
                  testID={`gym-setup-alt-${t.key}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setOverrideKey(t.key);
                    setWeightsChoice(null);
                    setKnownWeights({});
                    setShowAlternatives(false);
                  }}
                  className="min-h-11 gap-1 border-b border-border py-3"
                >
                  <Text className="font-medium">{t.name}</Text>
                  <Text variant="muted" className="text-xs">
                    {t.daysPerWeek}× a week · {t.description}
                  </Text>
                </Pressable>
              ))}
            </Sheet>
          </View>
        )}

        {step === 6 && (
          <View className="gap-5">
            <StepHeader
              title="Starting weights"
              description="We can find them for you over your first sessions, or you can enter what you know."
            />
            <ChipGroup
              testID="gym-setup-weights-choice"
              options={[
                {
                  value: 'help' as const,
                  label: 'Help me find them',
                  testID: 'gym-setup-weights-help',
                },
                {
                  value: 'know' as const,
                  label: 'I know my weights',
                  testID: 'gym-setup-weights-know',
                },
              ]}
              value={weightsChoice ? [weightsChoice] : []}
              onChange={(v) => setWeightsChoice(v[0] ?? null)}
            />
            {weightsChoice === 'know' && (
              <View className="gap-3">
                {exercises.map((ex, i) => (
                  <View key={ex.exerciseId} className="flex-row items-center gap-3">
                    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm">
                      {ex.name}
                    </Text>
                    <Input
                      testID={`gym-setup-weight-${ex.exerciseId}`}
                      keyboardType="decimal-pad"
                      inputAccessoryViewID={
                        Platform.OS === 'ios' ? WEIGHTS_ACCESSORY_ID : undefined
                      }
                      placeholder={unitLabel(unit)}
                      value={knownWeights[ex.exerciseId] ?? ''}
                      onChangeText={(text) =>
                        setKnownWeights((prev) => ({ ...prev, [ex.exerciseId]: text }))
                      }
                      className="w-24 text-right"
                      {...weightsChain.bind(i, { onFocus: scrollFieldIntoView })}
                    />
                    <Text variant="muted" className="text-xs">
                      {unitLabel(unit)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {weightsChoice === 'know' && exercises.length > 0 ? (
              <NumericReturnBar
                nativeID={WEIGHTS_ACCESSORY_ID}
                label={weightsChain.isLastFocused ? 'Done' : 'Next'}
                onPress={() => weightsChain.focusNext()}
                testID="gym-setup-weights-return"
              />
            ) : null}
          </View>
        )}

        {step === 7 && (
          <View className="gap-5">
            <StepHeader
              title="You're set"
              description="One last thing before your first session."
            />
            <Card className="gap-1">
              <Text className="font-semibold">{preview?.name ?? 'Your program'}</Text>
              <Text variant="muted" className="text-xs">
                {days}× a week ·{' '}
                {equipmentAccess === 'FULL_GYM'
                  ? 'Full gym'
                  : equipmentAccess === 'DUMBBELLS'
                    ? 'Dumbbells + bench'
                    : 'Bodyweight'}
              </Text>
            </Card>
            <Text testID="gym-setup-expectation" variant="muted">
              The first 6–8 weeks build the habit. Missing a session changes nothing. Aim for your
              weekly goal.
            </Text>
            {completeSetupMutation.isError && (
              <Text className="text-sm text-red-600" testID="gym-setup-error">
                {completeSetupMutation.error.message}
              </Text>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
