import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  TEMPLATE_BY_KEY,
  type RecommendResultDto,
  type TemplateSummaryDto,
  type VolumeGroup,
} from '@chefer/types';
import {
  haptics,
  IconButton,
  KeyboardAwareScrollView,
  MediaRow,
  PressableScale,
  ProgressBar,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { ExerciseNameLink } from '../../gym/components/exercise-name-link';
import type { TemplatePreview } from '../../gym/setup/template-preview';

// ─── Gym setup · "Your program" (10 Oct redesign, board GymSetup) ───────────
// Step 5 of the setup wizard in the new shell. The wizard owns every bit of
// state (recommend query, picked template, the on-device preview) and hands it
// in as props; this file only draws it. Owner note: the routines were hard to
// tell apart (all white, too much text), so each program is a card led by a
// big frequency frame ("3× a week"), and the one in use is the highlighted
// card — brand wash, 2pt brand border, filled frame and a check — whichever
// it is. The recommended program keeps its "Recommended" badge either way.

export interface ProgramStepProps {
  step: number;
  totalSteps: number;
  /** The wizard's own back (one step back; leaves setup from its first step). */
  onBack: () => void;
  recommendation: RecommendResultDto | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** The template key in use (the recommended one unless another was picked). */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Day-by-day preview of `selectedKey`. */
  preview: TemplatePreview | null;
  /** The optional session length from step 1 (flags days that run longer). */
  sessionLengthMins: number | null;
  canGoNext: boolean;
  onNext: () => void;
  /** Overlays the wizard keeps mounted (the leave-setup confirm). */
  children?: ReactNode;
}

type ProgramCardData = {
  key: string;
  name: string;
  daysPerWeek: number;
  summary: string;
};

/** "Full Body 3×" → "Full Body": the frame already says how often. */
function displayName(name: string, daysPerWeek: number): string {
  const stripped = name.replace(` ${String(daysPerWeek)}×`, '').trim();
  return stripped.length > 0 ? stripped : name;
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View
      testID="gym-setup-progress"
      accessible
      accessibilityLabel={`Step ${String(step)} of ${String(total)}`}
      className="flex-1 flex-row items-center justify-center gap-2"
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <View
          key={n}
          className={cn('h-2 w-2 rounded-full', n <= step ? 'bg-brand' : 'bg-brand-tint')}
        />
      ))}
    </View>
  );
}

function FrequencyFrame({ days, filled }: { days: number; filled: boolean }) {
  return (
    <View
      className={cn(
        'h-16 w-16 items-center justify-center rounded-control',
        filled ? 'bg-brand' : 'bg-brand-tint',
      )}
    >
      <Text className={cn('text-title2 font-bold', filled ? 'text-brand-on' : 'text-brand')}>
        {`${String(days)}×`}
      </Text>
      <Text className={cn('text-caption font-semibold', filled ? 'text-brand-on' : 'text-brand')}>
        a week
      </Text>
    </View>
  );
}

function ProgramCard({
  program,
  selected,
  recommended,
  onSelect,
}: {
  program: ProgramCardData;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const colors = useThemeColors();
  const name = displayName(program.name, program.daysPerWeek);
  const spoken = [
    name,
    `${String(program.daysPerWeek)} times a week`,
    recommended ? 'Recommended' : null,
    program.summary,
  ]
    .filter(Boolean)
    .join(', ');
  const select = () => {
    if (selected) return;
    haptics.selection();
    onSelect();
  };
  const body = (
    <>
      <FrequencyFrame days={program.daysPerWeek} filled={selected} />
      <View className="min-w-0 flex-1 gap-1">
        {recommended ? (
          <Text className="self-start rounded-full bg-brand px-2 text-subhead font-semibold text-brand-on">
            Recommended
          </Text>
        ) : null}
        <Text className="text-headline font-semibold text-label">{name}</Text>
        {program.summary ? (
          <Text
            testID={recommended ? 'gym-setup-why' : undefined}
            className="text-subhead text-label-secondary"
          >
            {program.summary}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      testID={`gym-setup-program-${program.key}`}
      className={cn(
        'flex-row items-center gap-3 rounded-card p-2.5',
        selected ? 'border-2 border-brand bg-brand-tint' : 'border border-separator bg-surface',
      )}
    >
      {/* MO-01 press feedback: the whole card selects the program. */}
      <PressableScale
        testID={`gym-setup-program-select-${program.key}`}
        pressScale="card"
        accessibilityRole="radio"
        accessibilityLabel={spoken}
        accessibilityState={{ selected, checked: selected }}
        onPress={select}
        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3"
      >
        {body}
      </PressableScale>
      {selected ? (
        <View testID={`gym-setup-program-check-${program.key}`} className="px-1">
          <Icon name="checkmark" size={24} color={colors.positive} />
        </View>
      ) : (
        // MO-01: the tinted "Use" button.
        <PressableScale
          testID={`gym-setup-alt-use-${program.key}`}
          accessibilityRole="button"
          accessibilityLabel={`Use ${name}, ${String(program.daysPerWeek)} times a week`}
          onPress={select}
          className="min-h-11 items-center justify-center rounded-control bg-brand-tint px-3.5"
        >
          <Text className="text-callout font-semibold text-brand">Use</Text>
        </PressableScale>
      )}
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="pt-2 text-title3 font-bold text-label">{children}</Text>;
}

function DayRow({
  day,
  index,
  sessionLengthMins,
}: {
  day: TemplatePreview['days'][number];
  index: number;
  sessionLengthMins: number | null;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const long = sessionLengthMins !== null && day.estimatedMin > sessionLengthMins;
  return (
    <View className="gap-2" testID={`gym-setup-preview-day-${String(index)}`}>
      <MediaRow
        testID={`gym-setup-day-row-${String(index)}`}
        title={day.name}
        meta={`${String(day.exercises.length)} exercises · ~${String(day.estimatedMin)} min`}
        badge={long ? `Over ${String(sessionLengthMins)} min` : undefined}
        illustration={<Icon name="barbell" size={24} color={colors.brand} />}
        accessibilityHint={open ? 'Hides the exercises' : 'Shows the exercises'}
        onPress={() => {
          haptics.selection();
          setOpen((v) => !v);
        }}
        action={
          <View className="h-11 w-11 items-center justify-center">
            <Icon
              name={open ? 'chevronUp' : 'chevronDown'}
              size={20}
              color={colors.labelTertiary}
            />
          </View>
        }
      />
      {open ? (
        <View
          testID={`gym-setup-day-exercises-${String(index)}`}
          className="gap-1 rounded-card border border-separator bg-surface px-3 py-2"
        >
          {long ? (
            <Text
              testID={`gym-setup-preview-day-${String(index)}-long`}
              className="text-caption text-label-secondary"
            >
              {`Longer than your ${String(sessionLengthMins)} min — pick a shorter time at Start and we’ll trim it.`}
            </Text>
          ) : null}
          {day.exercises.map((ex) => (
            <View key={ex.exerciseId} className="min-h-11 flex-row items-center gap-2">
              <ExerciseNameLink
                testID={`gym-setup-preview-exercise-${ex.exerciseId}`}
                exerciseId={ex.exerciseId}
                name={ex.name}
                numberOfLines={1}
                className="flex-1"
                textClassName="text-body text-label"
              />
              <Text className="text-subhead text-label-secondary">
                {`${String(ex.sets)} × ${ex.repMin === ex.repMax ? String(ex.repMin) : `${String(ex.repMin)}-${String(ex.repMax)}`}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function WeeklyBalance({ volume }: { volume: TemplatePreview['volume'] }) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  if (volume.length === 0) return null;
  return (
    <View
      testID="gym-setup-volume"
      className="rounded-card border border-separator bg-surface px-3 py-1"
    >
      {/* MO-01 press feedback on the disclosure row. */}
      <PressableScale
        testID="gym-setup-volume-toggle"
        accessibilityRole="button"
        accessibilityLabel="Weekly balance"
        accessibilityHint={open ? 'Hides sets per muscle group' : 'Shows sets per muscle group'}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          setOpen((v) => !v);
        }}
        className="min-h-11 flex-row items-center justify-between"
      >
        <Text className="text-headline font-semibold text-label">Weekly balance</Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={colors.labelTertiary} />
      </PressableScale>
      {open ? (
        <View className="gap-2 pb-2">
          {volume.map((v) => {
            const label = VOLUME_GROUP_LABELS[v.group as VolumeGroup];
            return (
              <View key={v.group} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-caption text-label">{label}</Text>
                  <Text className="text-caption text-label-secondary">{`${String(v.fractional)} sets`}</Text>
                </View>
                <ProgressBar
                  progress={v.fractional / Math.max(1, v.productiveMax)}
                  color={colors.brand}
                  className="h-1.5 bg-surface-sunken"
                  accessibilityLabel={`${label}, ${String(v.fractional)} sets`}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ProgramStep({
  step,
  totalSteps,
  onBack,
  recommendation,
  isLoading,
  isError,
  onRetry,
  selectedKey,
  onSelect,
  preview,
  sessionLengthMins,
  canGoNext,
  onNext,
  children,
}: ProgramStepProps) {
  const colors = useThemeColors();

  // Legacy has no explicit "recommended" flag on a template: the recommended
  // program is profile.recommend's `recommendedKey` (the one legacy
  // preselects), described by its `reason`; the alternatives by their own
  // one-line description.
  const recommended: ProgramCardData | null = recommendation
    ? {
        key: recommendation.recommendedKey,
        name:
          TEMPLATE_BY_KEY.get(recommendation.recommendedKey)?.name ?? recommendation.preview.name,
        daysPerWeek:
          TEMPLATE_BY_KEY.get(recommendation.recommendedKey)?.daysPerWeek ??
          recommendation.preview.days.length,
        summary: recommendation.reason,
      }
    : null;
  const alternatives: ProgramCardData[] = (recommendation?.alternatives ?? []).map(
    (t: TemplateSummaryDto) => ({
      key: t.key,
      name: t.name,
      daysPerWeek: t.daysPerWeek,
      summary: t.description,
    }),
  );

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-1 px-2 pt-2">
        <IconButton
          testID="gym-setup-title-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" size={26} color={colors.brand} />}
          onPress={onBack}
        />
        <StepDots step={step} total={totalSteps} />
        <View className="w-11" />
      </View>

      <KeyboardAwareScrollView
        testID="gym-setup-scroll"
        contentContainerClassName="gap-3.5 px-4 pb-8 pt-2"
        footer={
          <View className="border-t border-separator bg-surface px-4 pb-2 pt-3">
            {/* MO-01 press feedback on the primary action. */}
            <PressableScale
              testID="gym-setup-next"
              accessibilityRole="button"
              accessibilityLabel="Next"
              accessibilityState={{ disabled: !canGoNext }}
              disabled={!canGoNext}
              onPress={onNext}
              className={cn(
                'min-h-12 items-center justify-center rounded-control bg-brand px-4',
                !canGoNext && 'opacity-40',
              )}
            >
              <Text className="text-headline font-semibold text-brand-on">Next</Text>
            </PressableScale>
          </View>
        }
      >
        <View className="gap-1" testID="gym-setup-preview">
          <Text
            testID="gym-setup-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
          >
            Your program
          </Text>
          <Text className="text-body text-label-secondary">You can change it any time.</Text>
        </View>

        {isLoading ? (
          <Text testID="gym-setup-preview-loading" className="text-body text-label-secondary">
            Finding your program…
          </Text>
        ) : null}

        {isError ? (
          <View className="gap-3 rounded-card border border-separator bg-surface p-4">
            <Text
              testID="gym-setup-preview-offline"
              className="text-headline font-semibold text-label"
            >
              Setup needs a connection.
            </Text>
            <Text className="text-body text-label-secondary">Reconnect and try again.</Text>
            {/* MO-01 press feedback. */}
            <PressableScale
              testID="gym-setup-preview-retry"
              accessibilityRole="button"
              onPress={onRetry}
              className="min-h-11 items-center justify-center rounded-control bg-brand-tint px-4"
            >
              <Text className="text-callout font-semibold text-brand">Try again</Text>
            </PressableScale>
          </View>
        ) : null}

        {recommended ? (
          <View accessibilityRole="radiogroup" className="gap-3.5">
            <ProgramCard
              program={recommended}
              recommended
              selected={selectedKey === recommended.key}
              onSelect={() => onSelect(recommended.key)}
            />
            {alternatives.length > 0 ? (
              <View className="gap-2.5" testID="gym-setup-alternatives-inline">
                <SectionTitle>Or pick another</SectionTitle>
                {alternatives.map((alt) => (
                  <ProgramCard
                    key={alt.key}
                    program={alt}
                    recommended={false}
                    selected={selectedKey === alt.key}
                    onSelect={() => onSelect(alt.key)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {preview ? (
          <View className="gap-2" testID="gym-setup-days">
            <SectionTitle>{`${preview.name} · days`}</SectionTitle>
            {preview.days.map((day, i) => (
              <DayRow
                key={`${day.name}-${String(i)}`}
                day={day}
                index={i}
                sessionLengthMins={sessionLengthMins}
              />
            ))}
          </View>
        ) : null}

        {preview ? <WeeklyBalance volume={preview.volume} /> : null}
      </KeyboardAwareScrollView>
      {children}
    </Screen>
  );
}
