import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OnboardingJob } from '@chefer/types';
import { Input, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  cn,
  ONBOARDING_V4_COPY as COPY,
  eatsEverything,
  isQuickSafetyOn,
  ONBOARDING_V4_GOAL_TILES,
  ONBOARDING_V4_JOB_TILES,
  ONBOARDING_V4_QUICK_SAFETY,
  type SafetyPickerValue,
} from '@chefer/utils';
import { BiscuitStage, V4Caption, V4Chip, V4Heading, V4Tick, V4Tile, V4TileGrid } from './v4-ui';

// Presentational V4 steps — no tRPC here; onboarding-v4.tsx owns the saves.

export function JobsStep({
  jobs,
  onToggle,
}: {
  jobs: readonly OnboardingJob[];
  onToggle: (job: OnboardingJob) => void;
}) {
  return (
    <>
      <BiscuitStage loop="curious" size={170} />
      <V4Heading title={COPY.jobsTitle} lede={COPY.jobsLede} />
      <V4TileGrid>
        {ONBOARDING_V4_JOB_TILES.map((t) => (
          <V4Tile
            key={t.job}
            icon={t.icon}
            label={t.label}
            selected={jobs.includes(t.job)}
            onPress={() => onToggle(t.job)}
            testID={`onb-v4-job-${t.job}`}
          />
        ))}
      </V4TileGrid>
    </>
  );
}

/** `choice` = index into ONBOARDING_V4_GOAL_TILES, null = nothing picked yet. */
export function GoalStep({
  choice,
  onChoose,
}: {
  choice: number | null;
  onChoose: (i: number) => void;
}) {
  const tile = choice === null ? null : ONBOARDING_V4_GOAL_TILES[choice];
  return (
    <>
      <BiscuitStage loop={tile?.loop ?? 'curious'} size={170} />
      <V4Heading title={COPY.goalTitle} />
      <V4TileGrid>
        {ONBOARDING_V4_GOAL_TILES.map((t, i) => (
          <V4Tile
            key={t.label}
            role="radio"
            icon={t.icon}
            label={t.label}
            selected={choice === i}
            onPress={() => onChoose(i)}
            testID={`onb-v4-goal-${t.goal ?? 'GOOD_FOOD'}`}
          />
        ))}
      </V4TileGrid>
    </>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row rounded-control bg-surface-sunken p-[3px]"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            testID={`onb-v4-seg-${o.value}`}
            // No conditional shadow: adding one after first render makes NativeWind
            // upgrade the component, which throws in dev outside a navigator.
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-[10px]',
              on && 'bg-surface',
            )}
          >
            <Text
              className={cn(
                'text-callout font-semibold',
                on ? 'text-label' : 'text-label-secondary',
              )}
            >
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  testID,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  testID: string;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-subhead font-semibold text-label-secondary">{label}</Text>
      <View className="justify-center">
        {/* The Input primitive owns the return key and the numeric "Done" bar. */}
        <Input
          value={value}
          onChangeText={onChange}
          inputMode="decimal"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          accessibilityLabel={`${label.trim() || 'Height'}, ${unit}`}
          testID={testID}
          className="min-h-[50px] rounded-control border-separator bg-surface pr-9 text-title3 font-semibold text-label"
        />
        <Text pointerEvents="none" className="absolute right-3 text-subhead text-label-tertiary">
          {unit}
        </Text>
      </View>
    </View>
  );
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export interface AboutYouValue {
  sex: 'FEMALE' | 'MALE' | null;
  age: string;
  height: string;
  heightInches: string;
  weight: string;
  trainingWeekdays: number[];
}

export function AboutYouStep({
  value,
  onChange,
  imperial,
  showTraining,
  targetKcal,
  onChangeTarget,
}: {
  value: AboutYouValue;
  onChange: (v: AboutYouValue) => void;
  imperial: boolean;
  showTraining: boolean;
  /** Live estimate; null until age, height and weight are plausible. */
  targetKcal: number | null;
  onChangeTarget: () => void;
}) {
  const set = (patch: Partial<AboutYouValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <BiscuitStage loop="scale" size={120} />
      <V4Heading title={COPY.aboutTitle} />
      <Segmented
        label="Sex"
        value={value.sex}
        onChange={(sex) => set({ sex })}
        options={[
          { value: 'FEMALE', label: 'Female' },
          { value: 'MALE', label: 'Male' },
        ]}
      />
      <View className="flex-row gap-2">
        <NumberField
          label="Age"
          unit="yrs"
          value={value.age}
          onChange={(age) => set({ age })}
          testID="onb-v4-age"
        />
        {imperial ? (
          <>
            <NumberField
              label="Height"
              unit="ft"
              value={value.height}
              onChange={(height) => set({ height })}
              testID="onb-v4-height"
            />
            <NumberField
              label=" "
              unit="in"
              value={value.heightInches}
              onChange={(heightInches) => set({ heightInches })}
              testID="onb-v4-height-in"
            />
          </>
        ) : (
          <NumberField
            label="Height"
            unit="cm"
            value={value.height}
            onChange={(height) => set({ height })}
            testID="onb-v4-height"
          />
        )}
        <NumberField
          label="Weight"
          unit={imperial ? 'lb' : 'kg'}
          value={value.weight}
          onChange={(weight) => set({ weight })}
          testID="onb-v4-weight"
        />
      </View>
      {showTraining ? (
        <View className="gap-1.5">
          <V4Caption>{COPY.aboutTrainOn}</V4Caption>
          <View className="flex-row gap-1">
            {WEEKDAY_LETTERS.map((letter, day) => {
              const on = value.trainingWeekdays.includes(day);
              return (
                <PressableScale
                  key={day}
                  onPress={() =>
                    set({
                      trainingWeekdays: on
                        ? value.trainingWeekdays.filter((d) => d !== day)
                        : [...value.trainingWeekdays, day].sort((a, b) => a - b),
                    })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={WEEKDAY_NAMES[day]}
                  testID={`onb-v4-day-${day}`}
                  className={cn(
                    'min-h-11 flex-1 items-center justify-center rounded-full border',
                    on ? 'border-brand bg-brand' : 'border-separator bg-surface',
                  )}
                >
                  <Text
                    className={cn(
                      'text-subhead font-semibold',
                      on ? 'text-brand-on' : 'text-label',
                    )}
                  >
                    {letter}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}
      {targetKcal !== null ? (
        <View
          className="flex-row items-center gap-3 rounded-card bg-brand-tint p-3.5"
          testID="onb-v4-target"
        >
          <View className="min-w-0 flex-1">
            <Text className="text-subhead font-semibold text-label-secondary">
              {COPY.aboutTarget}
            </Text>
            <Text className="text-display font-bold text-brand">
              {targetKcal.toLocaleString('en-GB')}{' '}
              <Text className="text-headline font-semibold text-brand">kcal</Text>
            </Text>
          </View>
          <PressableScale
            onPress={onChangeTarget}
            accessibilityRole="button"
            accessibilityLabel={`${COPY.aboutTargetChange} activity level`}
            testID="onb-v4-target-change"
            className="min-h-11 justify-center rounded-control bg-surface px-3"
          >
            <Text className="text-subhead font-semibold text-brand">{COPY.aboutTargetChange}</Text>
          </PressableScale>
        </View>
      ) : null}
    </>
  );
}

export function SafetyStep({
  value,
  onToggleQuick,
  onEverything,
  onMore,
}: {
  value: SafetyPickerValue;
  onToggleQuick: (key: string) => void;
  onEverything: () => void;
  onMore: () => void;
}) {
  const c = useThemeColors();
  const everything = eatsEverything(value);
  return (
    <>
      <BiscuitStage loop="sniff" size={140} />
      <V4Heading title={COPY.safetyTitle} lede={COPY.safetyLede} />
      <PressableScale
        pressScale="card"
        onPress={onEverything}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: everything }}
        accessibilityLabel={COPY.safetyEverything}
        testID="onb-v4-safety-everything"
        className={cn(
          'min-h-14 flex-row items-center gap-3 rounded-card px-3.5',
          everything ? 'border-2 border-brand bg-brand-tint' : 'border border-separator bg-surface',
        )}
      >
        <View
          className={cn(
            'h-8 w-8 items-center justify-center rounded-full',
            everything ? 'bg-brand' : 'border-2 border-separator',
          )}
        >
          {everything ? <Ionicons name="checkmark" size={18} color={c.onBrand} /> : null}
        </View>
        <Text className="text-headline font-semibold text-label">{COPY.safetyEverything}</Text>
      </PressableScale>
      <View className="gap-2">
        <V4Caption>{COPY.safetyOrPick}</V4Caption>
        <View className="flex-row flex-wrap gap-2">
          {ONBOARDING_V4_QUICK_SAFETY.map((chip) => (
            <V4Chip
              key={chip.key}
              label={chip.label}
              selected={isQuickSafetyOn(value, chip.key)}
              onPress={() => onToggleQuick(chip.key)}
              testID={`onb-v4-safety-${chip.key}`}
            />
          ))}
        </View>
      </View>
      <PressableScale
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={COPY.safetyMore}
        testID="onb-v4-safety-more"
        className="min-h-11 flex-row items-center gap-1.5 self-start"
      >
        <Text className="text-callout font-semibold text-brand">{COPY.safetyMore}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.brand} />
      </PressableScale>
    </>
  );
}

/** The loader's checklist ticks one line at a time while the week builds. */
export function BuildingStep({ kcal, failed }: { kcal: number | null; failed: string | null }) {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (failed) return;
    const a = setTimeout(() => setTicks(1), 900);
    const b = setTimeout(() => setTicks(2), 1900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [failed]);
  return (
    <>
      <BiscuitStage loop="cooking" size={230} />
      <V4Heading title={failed ? COPY.buildingFailed : COPY.buildingTitle} />
      {failed ? (
        <Text className="text-center text-callout text-label-secondary">{failed}</Text>
      ) : (
        <View className="gap-3 self-center" accessibilityLiveRegion="polite">
          <V4Tick done={ticks >= 1} label={COPY.buildingMeals(kcal)} />
          <V4Tick done={ticks >= 2} label={COPY.buildingDiet} />
          <V4Tick done={false} label={COPY.buildingList} />
        </View>
      )}
    </>
  );
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ReadyStep({
  dinners,
  listCount,
  onOpenList,
}: {
  dinners: { day: number; name: string; kcal: number | null }[];
  listCount: number | null;
  onOpenList: () => void;
}) {
  const c = useThemeColors();
  return (
    <>
      <BiscuitStage loop="ready" size={150} />
      <V4Heading title={COPY.readyTitle} lede={COPY.readyLede} />
      <View className="gap-1.5" testID="onb-v4-ready-days">
        {dinners.map((d) => (
          <View
            key={d.day}
            className="min-h-[52px] flex-row items-center gap-3 rounded-control border border-separator bg-surface px-3"
          >
            <Text
              numberOfLines={1}
              className="w-11 text-caption font-bold uppercase tracking-wide text-brand"
            >
              {DAY_SHORT[d.day] ?? ''}
            </Text>
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-callout font-semibold text-label"
            >
              {d.name}
            </Text>
            {d.kcal ? (
              <Text className="text-caption text-label-tertiary">{d.kcal} kcal</Text>
            ) : null}
          </View>
        ))}
      </View>
      {listCount !== null && listCount > 0 ? (
        <PressableScale
          onPress={onOpenList}
          accessibilityRole="button"
          accessibilityLabel={COPY.readyList(listCount)}
          testID="onb-v4-ready-list"
          className="min-h-[50px] flex-row items-center gap-2.5 rounded-control bg-brand-tint px-3.5"
        >
          <Ionicons name="cart-outline" size={22} color={c.brand} />
          <Text className="flex-1 text-callout font-semibold text-brand">
            {COPY.readyList(listCount)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={c.brand} />
        </PressableScale>
      ) : null}
    </>
  );
}

const PERK_ICONS = [
  'sparkles-outline',
  'camera-outline',
  'play-circle-outline',
  'calendar-clear-outline',
] as const;

export function PremiumStep({ on, error }: { on: boolean; error: string | null }) {
  const c = useThemeColors();
  if (on) {
    return (
      <>
        <BiscuitStage loop="premium" size={200} />
        <V4Heading title={COPY.premiumOnTitle} />
        <View className="gap-3 self-center">
          {COPY.premiumOnTicks.map((t) => (
            <V4Tick key={t} done label={t} />
          ))}
        </View>
      </>
    );
  }
  return (
    <>
      <BiscuitStage loop="premium" size={150} />
      <View className="items-center gap-1.5">
        <Text className="text-caption font-bold tracking-widest text-brand">
          {COPY.premiumEyebrow}
        </Text>
        <Text accessibilityRole="header" className="text-center text-title1 font-bold text-label">
          {COPY.premiumTitle}
        </Text>
      </View>
      <View className="gap-2.5">
        {[0, 2].map((row) => (
          <View key={row} className="flex-row gap-2.5">
            {COPY.premiumPerks.slice(row, row + 2).map((perk, i) => (
              <View
                key={perk}
                className="min-h-24 flex-1 justify-between gap-2.5 rounded-card border border-separator bg-surface p-3.5"
              >
                <View className="h-10 w-10 items-center justify-center rounded-control bg-brand-tint">
                  <Ionicons
                    name={PERK_ICONS[row + i] ?? 'sparkles-outline'}
                    size={22}
                    color={c.brand}
                  />
                </View>
                <Text className="text-callout font-semibold text-label">{perk}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text className="text-center text-subhead text-label-secondary">
        {error ?? COPY.premiumNote}
      </Text>
    </>
  );
}

export function TrainStep({
  experience,
  onExperience,
  equipment,
  onEquipment,
  program,
  onChangeProgram,
}: {
  experience: 'BEGINNER' | 'INTERMEDIATE';
  onExperience: (v: 'BEGINNER' | 'INTERMEDIATE') => void;
  equipment: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT';
  onEquipment: (v: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT') => void;
  program: { name: string; days: number } | null;
  onChangeProgram: (() => void) | null;
}) {
  const c = useThemeColors();
  const row = (children: ReactNode) => <View className="flex-row flex-wrap gap-2">{children}</View>;
  return (
    <>
      <BiscuitStage loop="goalMuscle" size={150} />
      <V4Heading title={COPY.trainTitle} />
      <View className="gap-2">
        <V4Caption>{COPY.trainExperience}</V4Caption>
        {row(
          <>
            <V4Chip
              label={COPY.trainExperienceNew}
              selected={experience === 'BEGINNER'}
              onPress={() => onExperience('BEGINNER')}
              testID="onb-v4-exp-BEGINNER"
            />
            <V4Chip
              label={COPY.trainExperienceExperienced}
              selected={experience === 'INTERMEDIATE'}
              onPress={() => onExperience('INTERMEDIATE')}
              testID="onb-v4-exp-INTERMEDIATE"
            />
          </>,
        )}
      </View>
      <View className="gap-2">
        <V4Caption>{COPY.trainWhere}</V4Caption>
        {row(
          <>
            <V4Chip
              label={COPY.trainWhereGym}
              selected={equipment === 'FULL_GYM'}
              onPress={() => onEquipment('FULL_GYM')}
              testID="onb-v4-eq-FULL_GYM"
            />
            <V4Chip
              label={COPY.trainWhereDumbbells}
              selected={equipment === 'DUMBBELLS'}
              onPress={() => onEquipment('DUMBBELLS')}
              testID="onb-v4-eq-DUMBBELLS"
            />
            <V4Chip
              label={COPY.trainWhereBodyweight}
              selected={equipment === 'BODYWEIGHT'}
              onPress={() => onEquipment('BODYWEIGHT')}
              testID="onb-v4-eq-BODYWEIGHT"
            />
          </>,
        )}
      </View>
      <View
        className="min-h-[76px] flex-row items-center gap-3 rounded-card border border-separator bg-surface p-3.5"
        testID="onb-v4-program"
      >
        <View className="h-12 w-12 items-center justify-center rounded-control bg-brand-tint">
          <Ionicons name="barbell-outline" size={26} color={c.brand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-headline font-semibold text-label">{program?.name ?? '…'}</Text>
          {program ? (
            <Text className="text-subhead text-label-secondary">
              {COPY.trainFits(program.days)}
            </Text>
          ) : null}
        </View>
        {onChangeProgram ? (
          <PressableScale
            onPress={onChangeProgram}
            accessibilityRole="button"
            accessibilityLabel={`${COPY.trainChange} program`}
            testID="onb-v4-program-change"
            className="min-h-11 justify-center rounded-control bg-brand-tint px-3"
          >
            <Text className="text-subhead font-semibold text-brand">{COPY.trainChange}</Text>
          </PressableScale>
        ) : null}
      </View>
    </>
  );
}
