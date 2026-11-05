import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OnboardingJob } from '@chefer/types';
import { Input, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  cn,
  eatsEverything,
  isQuickSafetyOn,
  ONBOARDING_V4_GOAL_TILES,
  ONBOARDING_V4_JOB_TILES,
  ONBOARDING_V4_QUICK_SAFETY,
  type SafetyPickerValue,
} from '@chefer/utils';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import { useT } from '../../lib/i18n';
import { BiscuitStage, V4Caption, V4Chip, V4Heading, V4Tick, V4Tile, V4TileGrid } from './v4-ui';

// Presentational V4 steps — no tRPC here; onboarding-v4.tsx owns the saves.

export function JobsStep({
  jobs,
  onToggle,
}: {
  jobs: readonly OnboardingJob[];
  onToggle: (job: OnboardingJob) => void;
}) {
  const { t } = useT();
  return (
    <>
      <BiscuitStage loop="curious" size={170} />
      <V4Heading
        title={t('today.engagement.onboarding.jobs.title')}
        lede={t('today.engagement.onboarding.jobs.lede')}
      />
      <V4TileGrid>
        {ONBOARDING_V4_JOB_TILES.map((tile) => (
          <V4Tile
            key={tile.job}
            icon={tile.icon}
            label={t(`today.engagement.onboarding.jobs.tiles.${tile.job}`)}
            selected={jobs.includes(tile.job)}
            onPress={() => onToggle(tile.job)}
            testID={`onb-v4-job-${tile.job}`}
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
  const { t } = useT();
  const tile = choice === null ? null : ONBOARDING_V4_GOAL_TILES[choice];
  return (
    <>
      <BiscuitStage loop={tile?.loop ?? 'curious'} size={170} />
      <V4Heading title={t('today.engagement.onboarding.goal.title')} />
      <V4TileGrid>
        {ONBOARDING_V4_GOAL_TILES.map((goalTile, i) => (
          <V4Tile
            key={goalTile.label}
            role="radio"
            icon={goalTile.icon}
            label={t(`today.engagement.onboarding.goal.tiles.${goalTile.goal ?? 'GOOD_FOOD'}`)}
            selected={choice === i}
            onPress={() => onChoose(i)}
            testID={`onb-v4-goal-${goalTile.goal ?? 'GOOD_FOOD'}`}
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
  const { t } = useT();
  const name = label.trim() || t('today.engagement.onboarding.about.height');
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
          accessibilityLabel={t('today.engagement.onboarding.about.fieldLabel', {
            label: name,
            unit,
          })}
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

/** The quick chips' keys (ONBOARDING_V4_QUICK_SAFETY), as catalog keys. */
const QUICK_SAFETY_KEYS = [
  'vegetarian',
  'vegan',
  'nuts',
  'peanuts',
  'dairy',
  'gluten',
  'eggs',
  'fish',
] as const;
type QuickSafetyKey = (typeof QUICK_SAFETY_KEYS)[number];
const isQuickSafetyKey = (key: string): key is QuickSafetyKey =>
  (QUICK_SAFETY_KEYS as readonly string[]).includes(key);

/** Monday first, as the plan's `dayOfWeek` (0 = Monday). */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
  const { t, number } = useT();
  const set = (patch: Partial<AboutYouValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <BiscuitStage loop="scale" size={120} />
      <V4Heading title={t('today.engagement.onboarding.about.title')} />
      <Segmented
        label={t('today.engagement.onboarding.about.sex')}
        value={value.sex}
        onChange={(sex) => set({ sex })}
        options={[
          { value: 'FEMALE', label: t('today.engagement.onboarding.about.female') },
          { value: 'MALE', label: t('today.engagement.onboarding.about.male') },
        ]}
      />
      <View className="flex-row gap-2">
        <NumberField
          label={t('today.engagement.onboarding.about.age')}
          unit={t('today.engagement.onboarding.about.ageUnit')}
          value={value.age}
          onChange={(age) => set({ age })}
          testID="onb-v4-age"
        />
        {imperial ? (
          <>
            <NumberField
              label={t('today.engagement.onboarding.about.height')}
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
            label={t('today.engagement.onboarding.about.height')}
            unit="cm"
            value={value.height}
            onChange={(height) => set({ height })}
            testID="onb-v4-height"
          />
        )}
        <NumberField
          label={t('today.engagement.onboarding.about.weight')}
          unit={imperial ? 'lb' : 'kg'}
          value={value.weight}
          onChange={(weight) => set({ weight })}
          testID="onb-v4-weight"
        />
      </View>
      {showTraining ? (
        <View className="gap-1.5">
          <V4Caption>{t('today.engagement.onboarding.about.trainOn')}</V4Caption>
          <View className="flex-row gap-1">
            {WEEKDAY_KEYS.map((key, day) => {
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
                  accessibilityLabel={t(`common.weekdays.${key}`)}
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
                    {t(`today.engagement.onboarding.about.dayLetters.${key}`)}
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
              {t('today.engagement.onboarding.about.target')}
            </Text>
            <Text className="text-display font-bold text-brand">
              {number(targetKcal)}{' '}
              <Text className="text-headline font-semibold text-brand">
                {t('today.engagement.onboarding.about.targetUnit.kcal')}
              </Text>
            </Text>
          </View>
          <PressableScale
            onPress={onChangeTarget}
            accessibilityRole="button"
            accessibilityLabel={t('today.engagement.onboarding.about.targetChangeLabel')}
            testID="onb-v4-target-change"
            className="min-h-11 justify-center rounded-control bg-surface px-3"
          >
            <Text className="text-subhead font-semibold text-brand">
              {t('today.engagement.onboarding.about.targetChange')}
            </Text>
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
  const { t } = useT();
  const everything = eatsEverything(value);
  const everythingLabel = t('today.engagement.onboarding.safety.everything');
  const moreLabel = t('today.engagement.onboarding.safety.more');
  return (
    <>
      <BiscuitStage loop="sniff" size={140} />
      <V4Heading
        title={t('today.engagement.onboarding.safety.title')}
        lede={t('today.engagement.onboarding.safety.lede')}
      />
      <PressableScale
        pressScale="card"
        onPress={onEverything}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: everything }}
        accessibilityLabel={everythingLabel}
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
        <Text className="text-headline font-semibold text-label">{everythingLabel}</Text>
      </PressableScale>
      <View className="gap-2">
        <V4Caption>{t('today.engagement.onboarding.safety.orPick')}</V4Caption>
        <View className="flex-row flex-wrap gap-2">
          {ONBOARDING_V4_QUICK_SAFETY.map((chip) => (
            <V4Chip
              key={chip.key}
              label={
                isQuickSafetyKey(chip.key)
                  ? t(`today.engagement.onboarding.safety.chips.${chip.key}`)
                  : chip.label
              }
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
        accessibilityLabel={moreLabel}
        testID="onb-v4-safety-more"
        className="min-h-11 flex-row items-center gap-1.5 self-start"
      >
        <Text className="text-callout font-semibold text-brand">{moreLabel}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.brand} />
      </PressableScale>
    </>
  );
}

/** The loader's checklist ticks one line at a time while the week builds. */
export function BuildingStep({ kcal, failed }: { kcal: number | null; failed: string | null }) {
  const { t, number } = useT();
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
      <V4Heading
        title={
          failed
            ? t('today.engagement.onboarding.building.failed')
            : t('today.engagement.onboarding.building.title')
        }
      />
      {failed ? (
        <Text className="text-center text-callout text-label-secondary">{failed}</Text>
      ) : (
        <View className="gap-3 self-center" accessibilityLiveRegion="polite">
          <V4Tick
            done={ticks >= 1}
            label={
              kcal
                ? t('today.engagement.onboarding.building.meals.kcal', { value: number(kcal) })
                : t('today.engagement.onboarding.building.mealsNoTarget')
            }
          />
          <V4Tick done={ticks >= 2} label={t('today.engagement.onboarding.building.diet')} />
          <V4Tick done={false} label={t('today.engagement.onboarding.building.list')} />
        </View>
      )}
    </>
  );
}

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
  const { t, number } = useT();
  const listLabel =
    listCount !== null ? t('today.engagement.onboarding.ready.list', { count: listCount }) : '';
  return (
    <>
      <BiscuitStage loop="ready" size={150} />
      <V4Heading
        title={t('today.engagement.onboarding.ready.title')}
        lede={t('today.engagement.onboarding.ready.lede')}
      />
      <View className="gap-1.5" testID="onb-v4-ready-days">
        {dinners.map((d) => {
          const dayKey = WEEKDAY_KEYS[d.day];
          return (
            <View
              key={d.day}
              className="min-h-[52px] flex-row items-center gap-3 rounded-control border border-separator bg-surface px-3"
            >
              <Text
                numberOfLines={1}
                className="w-11 text-caption font-bold uppercase tracking-wide text-brand"
              >
                {dayKey ? t(`common.weekdaysShort.${dayKey}`) : ''}
              </Text>
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-callout font-semibold text-label"
              >
                {d.name}
              </Text>
              {d.kcal ? (
                <Text className="text-caption text-label-tertiary">
                  {t('today.engagement.onboarding.ready.dinner.kcal', { value: number(d.kcal) })}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {listCount !== null && listCount > 0 ? (
        <PressableScale
          onPress={onOpenList}
          accessibilityRole="button"
          accessibilityLabel={listLabel}
          testID="onb-v4-ready-list"
          className="min-h-[50px] flex-row items-center gap-2.5 rounded-control bg-brand-tint px-3.5"
        >
          <Ionicons name="cart-outline" size={22} color={c.brand} />
          <Text className="flex-1 text-callout font-semibold text-brand">{listLabel}</Text>
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
/** In PERK_ICONS order. */
const PERK_KEYS = ['chef', 'photo', 'import', 'weekly'] as const;

export function PremiumStep({ on, error }: { on: boolean; error: string | null }) {
  const c = useThemeColors();
  const { t } = useT();
  if (on) {
    return (
      <>
        <BiscuitStage loop="premium" size={200} />
        <V4Heading title={t('today.engagement.onboarding.premium.onTitle')} />
        <View className="gap-3 self-center">
          {PERK_KEYS.map((key) => (
            <V4Tick
              key={key}
              done
              label={t(`today.engagement.onboarding.premium.onTicks.${key}`)}
            />
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
          {t('today.engagement.onboarding.premium.eyebrow')}
        </Text>
        <Text accessibilityRole="header" className="text-center text-title1 font-bold text-label">
          {t('today.engagement.onboarding.premium.title')}
        </Text>
      </View>
      <View className="gap-2.5">
        {[0, 2].map((row) => (
          <View key={row} className="flex-row gap-2.5">
            {PERK_KEYS.slice(row, row + 2).map((perk, i) => (
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
                <Text className="text-callout font-semibold text-label">
                  {t(`today.engagement.onboarding.premium.perks.${perk}`)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text className="text-center text-subhead text-label-secondary">
        {error ?? t('today.engagement.onboarding.premium.note')}
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
  styleQuestion,
  simple = false,
}: {
  experience: 'BEGINNER' | 'INTERMEDIATE';
  onExperience: (v: 'BEGINNER' | 'INTERMEDIATE') => void;
  equipment: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT';
  onEquipment: (v: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT') => void;
  program: { name: string; days: number } | null;
  onChangeProgram: (() => void) | null;
  /**
   * Simple training mode §6.1: "How do you like to train?" at the top of the
   * step (flag on only). A "Keep it simple" answer (`simple`) hides the
   * experience, equipment and program — nothing else is asked.
   */
  styleQuestion?: ReactNode;
  simple?: boolean;
}) {
  const c = useThemeColors();
  const { t } = useT();
  const row = (children: ReactNode) => <View className="flex-row flex-wrap gap-2">{children}</View>;
  return (
    <>
      <BiscuitStage loop="goalMuscle" size={150} />
      <V4Heading title={t('today.engagement.onboarding.train.title')} />
      {styleQuestion ?? null}
      {simple ? null : (
        <TrainProgramFields
          experience={experience}
          onExperience={onExperience}
          equipment={equipment}
          onEquipment={onEquipment}
          program={program}
          onChangeProgram={onChangeProgram}
          row={row}
          brand={c.brand}
        />
      )}
    </>
  );
}

function TrainProgramFields({
  experience,
  onExperience,
  equipment,
  onEquipment,
  program,
  onChangeProgram,
  row,
  brand,
}: {
  experience: 'BEGINNER' | 'INTERMEDIATE';
  onExperience: (v: 'BEGINNER' | 'INTERMEDIATE') => void;
  equipment: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT';
  onEquipment: (v: 'FULL_GYM' | 'DUMBBELLS' | 'BODYWEIGHT') => void;
  program: { name: string; days: number } | null;
  onChangeProgram: (() => void) | null;
  row: (children: ReactNode) => ReactNode;
  brand: string;
}) {
  const { t } = useT();
  return (
    <>
      <View className="gap-2">
        <V4Caption>{t('today.engagement.onboarding.train.experience')}</V4Caption>
        {row(
          <>
            <V4Chip
              label={t('today.engagement.onboarding.train.experienceNew')}
              selected={experience === 'BEGINNER'}
              onPress={() => onExperience('BEGINNER')}
              testID="onb-v4-exp-BEGINNER"
            />
            <V4Chip
              label={t('today.engagement.onboarding.train.experienceExperienced')}
              selected={experience === 'INTERMEDIATE'}
              onPress={() => onExperience('INTERMEDIATE')}
              testID="onb-v4-exp-INTERMEDIATE"
            />
          </>,
        )}
      </View>
      <View className="gap-2">
        <V4Caption>{t('today.engagement.onboarding.train.where')}</V4Caption>
        {row(
          <>
            <V4Chip
              label={t('today.engagement.onboarding.train.whereGym')}
              selected={equipment === 'FULL_GYM'}
              onPress={() => onEquipment('FULL_GYM')}
              testID="onb-v4-eq-FULL_GYM"
            />
            <V4Chip
              label={t('today.engagement.onboarding.train.whereDumbbells')}
              selected={equipment === 'DUMBBELLS'}
              onPress={() => onEquipment('DUMBBELLS')}
              testID="onb-v4-eq-DUMBBELLS"
            />
            <V4Chip
              label={t('today.engagement.onboarding.train.whereBodyweight')}
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
          <Ionicons name="barbell-outline" size={26} color={brand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-headline font-semibold text-label">{program?.name ?? '…'}</Text>
          {program ? (
            <Text className="text-subhead text-label-secondary">
              {t('today.engagement.onboarding.train.fits', { count: program.days })}
            </Text>
          ) : null}
        </View>
        {onChangeProgram ? (
          <PressableScale
            onPress={onChangeProgram}
            accessibilityRole="button"
            accessibilityLabel={t('today.engagement.onboarding.train.changeLabel')}
            testID="onb-v4-program-change"
            className="min-h-11 justify-center rounded-control bg-brand-tint px-3"
          >
            <Text className="text-subhead font-semibold text-brand">
              {t('today.engagement.onboarding.train.change')}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </>
  );
}

/**
 * Lane E1 — "Remind me at mealtimes?": the planned meals with their suggested
 * times (read-only here; Settings → Notifications edits them). The footer's
 * "Yes, remind me" is where the OS permission is asked.
 */
export function RemindersStep({
  rows,
  refused,
}: {
  rows: { slot: string; label: string; time: string }[];
  refused: boolean;
}) {
  const { t } = useT();
  return (
    <>
      <BiscuitStage loop="cooking" size={150} />
      <V4Heading title={t('today.reminders.stepTitle')} lede={t('today.reminders.stepBody')} />
      <View className="gap-1.5" testID="onb-v4-reminders-times">
        {rows.map((r) => (
          <View
            key={r.slot}
            className="min-h-[52px] flex-row items-center gap-3 rounded-control border border-separator bg-surface px-3"
          >
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-callout font-semibold text-label"
            >
              {r.label}
            </Text>
            <Text className="text-callout text-label-secondary">{r.time}</Text>
          </View>
        ))}
      </View>
      {refused ? (
        <NotificationsOffRow testID="onb-v4-reminders-off" message={t('today.reminders.off')} />
      ) : (
        <V4Caption>{t('today.reminders.stepLater')}</V4Caption>
      )}
    </>
  );
}
