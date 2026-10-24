import { memo, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Translator } from '@chefer/i18n';
import {
  HIDDEN_EXERCISE_IMAGE_IDS,
  RIR_VALUES,
  type EquipmentProfile,
  type ExerciseBest,
  type ExerciseDto,
  type Rir,
  type SessionExerciseDoc,
  type SessionSummaryDto,
  type Suggestion,
  type WeightUnit,
} from '@chefer/types';
import {
  Chip,
  listEntering,
  listExiting,
  listLayout,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn, explain, formatLoadNumber, unitLabel } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import type { TrainerLines } from '../../coaching/logger-lines';
import { ExerciseImage } from '../components/exercise-image';
import { exerciseImageUrl } from '../library/exercise-image';
import { TrainerNoteLine } from '../routine/attribution';
import { isAtSetCap, setCapReason } from './caps';
import { CardioEntry } from './cardio-entry';
import { SetRow, type SetRowHandlers } from './set-row';
import {
  DIRECTION_ICON,
  directionOf,
  isCalibrating,
  isCardioMeta,
  isDone,
  lastNoteFor,
  lastTimeSets,
  lastWorkingSetDone,
  livePr,
  warmupSetsOf,
  weightModeOf,
  workingSets,
} from './workout-model';

export type WorkoutSheetRequest =
  | { kind: 'menu'; seId: string }
  | { kind: 'technique'; seId: string }
  | { kind: 'why'; seId: string }
  | { kind: 'weight'; seId: string; setId: string }
  | { kind: 'reps'; seId: string; setId: string };

/** Everything a card needs that isn't the exercise itself — one memoised object. */
export interface WorkoutContext {
  unit: WeightUnit;
  profile: EquipmentProfile;
  lookup: (exerciseId: string) => ExerciseDto;
  /** Completed sessions before this one (last-time column, PRs, history). */
  prior: SessionSummaryDto[];
  /** Bootstrap `olderBests` — PRs must beat these too (audit F-GYM-6-1). */
  olderBests?: Record<string, ExerciseBest> | undefined;
  /** Trainer mode M3 (coached workout): history is only the client's last exposure — no live PR badge. */
  noLivePr?: boolean;
  /**
   * UX-44 (T-44.3): `edit` is the logger over a past session — no Why?/Next-time
   * banner (they describe the future; the notice on Gym Today covers it) and the
   * reps-left row is a collapsed `Change` line instead of a prompt. Omitted = live.
   * `log` (owner dogfood 2026-09-30) is edit mode over a NEW past workout:
   * every listed set counts, so the sets have no ✓ and no done count.
   */
  mode?: 'live' | 'edit' | 'log';
  /**
   * Trainer coaching (WP-18, level 6+): the trainer's cue under the exercise name and "Set by Ana" on a
   * trainer-set target. Omitted (null) for an uncoached user — the card is unchanged.
   */
  trainer?: TrainerLines | null;
  handlers: SetRowHandlers;
  onSheet: (request: WorkoutSheetRequest) => void;
  onToggle: (seId: string) => void;
  onRir: (seId: string, rir: Rir | null) => void;
  /** "Not now" on the RIR question. */
  onRirDismiss: (seId: string) => void;
  onSkip: (seId: string, skipped: boolean) => void;
  onAddSet: (seId: string) => void;
  onLayoutY: (seId: string, y: number) => void;
  /** T-42.3: "Log it" on a cardio entry — completes the exercise's one set with these fields. */
  onLogCardio: (seId: string, setId: string, fields: CardioLogFields) => void;
}

/** T-42.3: the fields a cardio "Log it" can set (S20, Δ2.2) — a subset of SessionSetDoc's cardio columns. */
export interface CardioLogFields {
  durationSec?: number;
  distanceM?: number;
  intensityRpe?: number;
  resistanceLevel?: number;
}

export interface ExerciseCardProps {
  exercise: SessionExerciseDoc;
  index: number;
  expanded: boolean;
  isCurrent: boolean;
  /** Superset letter ("A") when the card is part of one; primitives keep memo cheap. */
  supersetLabel?: string | null;
  /** 0-based place inside the superset ("A1" = 0). */
  supersetIndex?: number;
  /** The set to do next, when it is in this card. */
  focusSetId?: string | null;
  ctx: WorkoutContext;
}

function bannerChip(s: Suggestion, unit: WeightUnit, t: Translator['t']): string {
  if (s.kind === 'deload') return t('gym.workout.logger.card.deload');
  if (s.kind === 'start') return t('gym.workout.logger.card.new');
  const dir = directionOf(s);
  const delta = Math.abs(s.deltaKg);
  if (dir === 'same' || delta < 0.005) return DIRECTION_ICON[dir];
  return `${DIRECTION_ICON[dir]} ${formatLoadNumber(delta, unit)} ${unitLabel(unit)}`;
}

function ExerciseCardImpl({
  exercise: se,
  index,
  expanded,
  isCurrent,
  supersetLabel = null,
  supersetIndex = 0,
  focusSetId = null,
  ctx,
}: ExerciseCardProps) {
  const { t } = useT();
  const colors = useThemeColors();
  const base = `exercise-${index}`;
  const atSetCap = isAtSetCap(se.sets.length);
  const meta = ctx.lookup(se.exerciseId);
  // WP-04 device pass: at large OS text the suggestion squeezed to one word per
  // line between the chip and "Why?" — stack it under them instead.
  const { fontScale } = useWindowDimensions();
  const stackSuggestion = fontScale > 1.2;
  const [showWarmups, setShowWarmups] = useState(false);
  const [rirOpen, setRirOpen] = useState<boolean | null>(null);

  const lastSets = useMemo(
    () => lastTimeSets(se.exerciseId, ctx.prior),
    [se.exerciseId, ctx.prior],
  );
  const lastNote = useMemo(() => lastNoteFor(se.exerciseId, ctx.prior), [se.exerciseId, ctx.prior]);
  const pr = useMemo(
    () => (ctx.noLivePr ? null : livePr(se, ctx.prior, ctx.olderBests?.[se.exerciseId])),
    [se, ctx.prior, ctx.olderBests, ctx.noLivePr],
  );
  const trainerNote = ctx.trainer?.noteFor(se) ?? null;
  const setBy = ctx.trainer?.setByFor(se) ?? null;
  const sentence = useMemo(
    () => explain(se.prescription, ctx.unit, 'today', setBy),
    [se.prescription, ctx.unit, setBy],
  );
  const weightMode = weightModeOf(meta, ctx.profile, se.prescription.weightKg > 0);
  const working = workingSets(se);
  const warmups = warmupSetsOf(se);
  const done = working.filter(isDone).length;
  const warmupsDone = warmups.filter(isDone).length;
  const range = se.repMin === se.repMax ? `${se.repMin}` : `${se.repMin}–${se.repMax}`;
  const cardio = isCardioMeta(meta);
  const logging = ctx.mode === 'log';
  // AC1: a cardio card never shows kg/sets/RIR — just done/not-done.
  const subtitle = cardio
    ? working[0] && isDone(working[0])
      ? t('gym.workout.logger.card.logged')
      : t('gym.workout.logger.card.notLoggedYet')
    : logging
      ? `${working.length} × ${range}${meta.isTimed ? ' s' : ''}`
      : `${working.length} × ${range}${meta.isTimed ? ' s' : ''} · ${t('gym.workout.logger.card.doneCount', { done, total: working.length })}`;
  const imageUri = exerciseImageUrl(meta);
  const calibrating = isCalibrating(se.prescription);
  const editing = ctx.mode === 'edit' || logging;
  const showRir = !se.skipped && (editing ? working.length > 0 : lastWorkingSetDone(se));
  const rirExpanded = rirOpen ?? (!editing && se.lastSetRir === null);

  return (
    <View
      testID={base}
      onLayout={(e) => ctx.onLayoutY(se.id, e.nativeEvent.layout.y)}
      className={cn(
        'rounded-card border bg-surface',
        isCurrent && !se.skipped ? 'border-brand/50' : 'border-separator',
        supersetLabel && 'border-l-4 border-l-brand',
        se.skipped && 'opacity-60',
      )}
    >
      <View className="flex-row items-center gap-2 p-2">
        <Pressable
          testID={`${base}-thumb`}
          accessibilityRole="button"
          accessibilityLabel={t('gym.workout.logger.card.technique', { name: meta.name })}
          onPress={() => ctx.onSheet({ kind: 'technique', seId: se.id })}
          className="overflow-hidden rounded-control"
        >
          <ExerciseImage
            uri={imageUri}
            equipment={meta.equipment}
            name={meta.name}
            size="thumb"
            hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(meta.id)}
            analyticsExerciseId={meta.ownerId ? 'custom' : meta.id}
            testID={`${base}-thumb-image`}
          />
        </Pressable>
        <Pressable
          testID={`${base}-header`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${meta.name}, ${subtitle}`}
          onPress={() => ctx.onToggle(se.id)}
          className="min-h-12 min-w-0 flex-1 justify-center"
        >
          <View className="flex-row items-center gap-1.5">
            {supersetLabel ? (
              <View className="rounded-inner bg-brand-tint px-1.5 py-0.5">
                <Text
                  testID={`${base}-superset`}
                  accessibilityLabel={t('gym.workout.exerciseCard.supersetChip', {
                    label: supersetLabel,
                    n: supersetIndex + 1,
                  })}
                  className="text-caption font-bold text-brand"
                >
                  {supersetLabel}
                  {supersetIndex + 1}
                </Text>
              </View>
            ) : null}
            <Text
              testID={`${base}-name`}
              numberOfLines={2}
              className="min-w-0 flex-1 text-headline font-semibold text-label"
            >
              {meta.name}
            </Text>
          </View>
          <Text
            testID={`${base}-progress`}
            numberOfLines={2}
            className="text-subhead text-label-secondary"
          >
            {se.skipped ? t('gym.session.skipped') : subtitle}
            {pr ? ` · ${t('gym.workout.logger.card.pr')}` : ''}
          </Text>
          {trainerNote && ctx.trainer ? (
            <TrainerNoteLine
              testID={`${base}-trainer-note`}
              trainer={ctx.trainer.trainerName}
              note={trainerNote}
            />
          ) : null}
          {lastNote && !editing ? (
            <Text
              testID={`${base}-last-note`}
              numberOfLines={2}
              className="text-subhead text-label-secondary"
            >
              {t('gym.workout.setRow.lastTime', { value: lastNote })}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          testID={`${base}-menu`}
          accessibilityRole="button"
          accessibilityLabel={t('gym.workout.logger.card.moreOptions', { name: meta.name })}
          onPress={() => ctx.onSheet({ kind: 'menu', seId: se.id })}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-sunken"
        >
          <Icon name="more" color={colors.label} />
        </Pressable>
      </View>

      {se.skipped ? (
        <View className="flex-row items-center justify-between px-3 pb-2">
          <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
            {t('gym.workout.logger.card.skippedBody')}
          </Text>
          <Pressable
            testID={`${base}-unskip`}
            accessibilityRole="button"
            onPress={() => ctx.onSkip(se.id, false)}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-callout font-semibold text-brand">
              {t('gym.workout.view.undo')}
            </Text>
          </Pressable>
        </View>
      ) : expanded && cardio ? (
        <View className="gap-2 px-2 pb-3">
          <CardioEntry
            se={se}
            meta={meta}
            unit={ctx.unit}
            prior={ctx.prior}
            testID={`${base}-cardio`}
            onLogIt={(fields) => {
              const setId = working[0]?.id;
              if (setId) ctx.onLogCardio(se.id, setId, fields);
            }}
          />
          {se.notes ? (
            <Text testID={`${base}-note`} className="px-1 text-subhead text-label-secondary">
              {t('gym.workout.logger.card.note', { note: se.notes })}
            </Text>
          ) : null}
        </View>
      ) : expanded ? (
        <View className="gap-2 px-2 pb-3">
          {editing ? null : (
            <View
              testID={`${base}-suggestion-row`}
              className={cn(
                'gap-2 rounded-control bg-brand-tint p-2',
                stackSuggestion ? 'flex-row flex-wrap items-center' : 'flex-row items-start',
              )}
            >
              <View className="rounded-inner bg-surface px-2 py-1">
                <Text testID={`${base}-direction`} className="text-caption font-bold text-brand">
                  {bannerChip(se.prescription, ctx.unit, t)}
                </Text>
              </View>
              {stackSuggestion ? (
                <View className="flex-1" />
              ) : (
                <Text
                  testID={`${base}-suggestion`}
                  className="min-w-0 flex-1 text-callout text-label"
                >
                  {sentence}
                </Text>
              )}
              <Pressable
                testID={`${base}-why`}
                accessibilityRole="button"
                accessibilityLabel={t('gym.workout.logger.card.whyA11y')}
                onPress={() => ctx.onSheet({ kind: 'why', seId: se.id })}
                className="-my-2 min-h-11 justify-center px-2"
              >
                <Text className="text-callout font-semibold text-brand">
                  {t('gym.workout.exerciseCard.why')}
                </Text>
              </Pressable>
              {stackSuggestion ? (
                <Text
                  testID={`${base}-suggestion`}
                  className="w-full min-w-0 text-callout text-label"
                >
                  {sentence}
                </Text>
              ) : null}
            </View>
          )}

          {warmups.length > 0 ? (
            <View>
              <Pressable
                testID={`${base}-warmups-toggle`}
                accessibilityRole="button"
                accessibilityState={{ expanded: showWarmups }}
                onPress={() => setShowWarmups((v) => !v)}
                className="min-h-11 flex-row items-center justify-between px-1"
              >
                <Text className="text-subhead text-label-secondary">
                  {t('gym.workout.exerciseCard.warmups', { count: warmups.length })}
                  {warmupsDone > 0
                    ? ` · ${t('gym.workout.logger.card.warmupsDone', { count: warmupsDone })}`
                    : ''}
                </Text>
                <View className="flex-row items-center gap-1">
                  <Text className="text-subhead font-semibold text-brand">
                    {showWarmups
                      ? t('gym.workout.logger.card.hide')
                      : t('gym.workout.logger.card.show')}
                  </Text>
                  <Icon
                    name={showWarmups ? 'chevronUp' : 'chevronDown'}
                    size={16}
                    color={colors.brand}
                  />
                </View>
              </Pressable>
              {showWarmups
                ? warmups.map((s, i) => (
                    <SetRow
                      key={s.id}
                      seId={se.id}
                      set={s}
                      label={t('gym.workout.setName.warmup', { n: i + 1 })}
                      last={null}
                      meta={meta}
                      profile={ctx.profile}
                      unit={ctx.unit}
                      weightMode={weightMode}
                      prKind={null}
                      focused={focusSetId === s.id}
                      handlers={ctx.handlers}
                      showCheck={!logging}
                      testID={`${base}-warmup-${i + 1}`}
                    />
                  ))
                : null}
            </View>
          ) : null}

          {working.map((s, i) => (
            // MO-04: an added set fades in, a removed one fades out, the rest glide.
            <Animated.View
              key={s.id}
              entering={listEntering}
              exiting={listExiting}
              layout={listLayout}
            >
              <SetRow
                seId={se.id}
                set={s}
                label={t('gym.workout.setName.set', { n: i + 1 })}
                last={lastSets[i] ?? null}
                meta={meta}
                profile={ctx.profile}
                unit={ctx.unit}
                weightMode={weightMode}
                prKind={pr?.setId === s.id ? pr.kind : null}
                focused={focusSetId === s.id}
                handlers={ctx.handlers}
                showCheck={!logging}
                testID={`${base}-set-${i + 1}`}
              />
            </Animated.View>
          ))}

          {showRir ? (
            rirExpanded ? (
              <View
                testID={`${base}-rir`}
                className={cn(
                  'gap-2 rounded-control p-3',
                  calibrating ? 'border border-brand/40 bg-brand-tint' : 'bg-surface-sunken',
                )}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="text-callout font-medium text-label">
                      {t('gym.workout.logger.card.rirQuestion')}
                    </Text>
                    {calibrating ? (
                      <Text testID={`${base}-rir-calibrating`} className="text-caption text-brand">
                        {t('gym.workout.logger.card.rirHelp')}
                      </Text>
                    ) : (
                      <Text className="text-caption text-label-secondary">
                        {t('gym.workout.logger.card.rirOptional')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    testID={`${base}-rir-hide`}
                    accessibilityRole="button"
                    accessibilityLabel={t('gym.workout.logger.card.rirHideA11y')}
                    onPress={() => {
                      setRirOpen(false);
                      ctx.onRirDismiss(se.id);
                    }}
                    className="-my-2 min-h-11 justify-center px-2"
                  >
                    <Text className="text-subhead font-semibold text-label-secondary">
                      {se.lastSetRir === null
                        ? t('gym.workout.logger.rest.notNow')
                        : t('common.actions.done')}
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-2">
                  {RIR_VALUES.map((v) => (
                    <Chip
                      key={v}
                      testID={`${base}-rir-${v}`}
                      label={v === 3 ? '3+' : String(v)}
                      selected={se.lastSetRir === v}
                      className="flex-1 px-0"
                      onPress={() => {
                        ctx.onRir(se.id, se.lastSetRir === v ? null : v);
                        if (se.lastSetRir !== v) setRirOpen(false);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <Pressable
                testID={`${base}-rir-summary`}
                accessibilityRole="button"
                onPress={() => setRirOpen(true)}
                className="min-h-11 flex-row items-center justify-between gap-2 rounded-control bg-surface-sunken px-3"
              >
                <Text className="min-w-0 flex-1 text-callout text-label">
                  {se.lastSetRir === null
                    ? t('gym.workout.logger.card.rirSummaryEmpty')
                    : t('gym.workout.logger.card.rirSummary', {
                        value: se.lastSetRir === 3 ? '3+' : String(se.lastSetRir),
                      })}
                </Text>
                <Text className="text-callout font-semibold text-brand">
                  {se.lastSetRir === null
                    ? t('gym.workout.logger.card.add')
                    : t('gym.workout.logger.card.change')}
                </Text>
              </Pressable>
            )
          ) : null}

          {se.notes ? (
            <Text testID={`${base}-note`} className="px-1 text-subhead text-label-secondary">
              {t('gym.workout.logger.card.note', { note: se.notes })}
            </Text>
          ) : null}

          {/* UX-GYM-01: the schema allows 20 sets per exercise — past that a
              workout can never sync, so the button says why it is disabled. */}
          {atSetCap ? (
            <View
              testID={`${base}-add-set`}
              accessible
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel={t('gym.workout.logger.card.addSetUnavailable', {
                reason: setCapReason(),
              })}
              className="min-h-12 items-center justify-center rounded-control border border-dashed border-separator px-3 py-2 opacity-60"
            >
              <Text numberOfLines={1} className="text-callout font-semibold text-label-secondary">
                {t('gym.workout.view.addSet')}
              </Text>
              <Text testID={`${base}-add-set-reason`} className="text-subhead text-label-secondary">
                {setCapReason()}
              </Text>
            </View>
          ) : (
            <Pressable
              testID={`${base}-add-set`}
              accessibilityRole="button"
              onPress={() => ctx.onAddSet(se.id)}
              className="min-h-12 flex-row items-center justify-center gap-1.5 rounded-control border border-dashed border-brand/40"
            >
              <Icon name="add" size={20} color={colors.brand} />
              {/* Large screens: on Android (tablet, 2x density) this shrink-wrapped
                  semibold label was drawn a hair wider than RN measured it, so
                  "set" wrapped onto a second line the 1-line box clips —
                  "Add" (seen after a rotation). One line can't wrap. */}
              <Text numberOfLines={1} className="text-callout font-semibold text-brand">
                {t('gym.workout.view.addSet')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
