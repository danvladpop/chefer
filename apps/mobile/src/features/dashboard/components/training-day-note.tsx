import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PlanTrainingBasis, PlanTrainingDay, TrainingDayNutrition } from '@chefer/types';
import { colors, ExplainSheet, Text } from '@chefer/ui-mobile';
import {
  cn,
  trainingDayLine,
  trainingExplainCopy,
  trainingGlyph,
  weekdayLongName,
} from '@chefer/utils';
import { openPremium } from '../../premium/open-premium';

/**
 * Training-aware nutrition (audit P2-4), mirrors web's TrainingDayNote and is
 * shared by Today (nutrition summary) and the tracker. When the bump is
 * applied (premium, or free while the server's trainingBumpFree flag is on)
 * the note reads as fact: glyph, the line, what was added and a `Why?` link
 * that opens the Explain sheet (PAT-1, T-06.5). When it is not applied the
 * same numbers show as a locked preview with `Fit meals to my training days`
 * opening the premium sheet (T-10.2).
 *
 * `isToday` = false on the tracker's other days: the copy then says "this
 * day" instead of "today".
 *
 * `restKcal` / `restProteinG` (the rest-day target) are optional; without them
 * the Explain sheet omits its rest-day row.
 */
export function TrainingDayNote({
  t,
  isToday = true,
  restKcal,
  restProteinG,
  className,
}: {
  t: TrainingDayNutrition;
  isToday?: boolean;
  restKcal?: number;
  restProteinG?: number;
  className?: string;
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  // Mounted on first open and kept, so the sheet still plays its exit motion.
  const [explainMounted, setExplainMounted] = useState(false);
  if (!t.isTrainingDay) return null;
  const kind = t.kind ?? 'lift';
  const isRun = kind !== 'lift';
  const workout = t.workoutName ?? 'Your workout';
  const when = t.reason === 'COMPLETED' ? 'done' : isToday ? 'today' : 'planned';
  const day = isToday ? 'today' : 'this day';
  const glyph = trainingGlyph(kind);

  // A single-day PlanTrainingDay for the shared Explain copy (T-06.5).
  const jsDay = new Date().getDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const explainDay: PlanTrainingDay = {
    dayOfWeek,
    dayName: weekdayLongName(dayOfWeek),
    kind,
    workoutName: t.workoutName ?? null,
    kcalBonus: t.kcalBonus,
    proteinBonus: t.proteinBonus,
    carbsBonus: t.carbsBonus ?? 0,
    done: t.reason === 'COMPLETED',
    applied: t.applied,
    // UX-FOOD-19: the day's real target, so the sheet quotes it beside the rest-day one.
    ...(t.applied &&
      restKcal !== undefined &&
      restProteinG !== undefined && {
        targetKcal: restKcal + t.kcalBonus,
        targetProteinG: restProteinG + t.proteinBonus,
      }),
  };
  const basis: PlanTrainingBasis | null =
    restKcal !== undefined && restProteinG !== undefined
      ? {
          restKcal,
          restProteinG,
          proteinGPerKg: t.basis.proteinGPerKg,
          bodyweightKg: t.basis.bodyweightKg,
        }
      : null;
  const explain = trainingExplainCopy({ days: [explainDay], basis });

  return (
    <View
      testID="training-day"
      className={cn(
        'mb-4 rounded-xl px-3 py-2.5',
        t.applied ? 'bg-accent' : 'border border-dashed border-gray-300 bg-gray-50',
        className,
      )}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons
          name={glyph}
          size={16}
          color={t.applied ? colors.primary : colors.mutedForeground}
        />
        <Text
          testID="training-day-line"
          className={cn(
            'min-w-0 flex-1 text-xs font-semibold',
            t.applied ? 'text-primary' : 'text-gray-700',
          )}
        >
          {trainingDayLine(t)}
        </Text>
      </View>
      {t.applied ? (
        <>
          <Text className="mt-0.5 text-xs text-primary/80">
            {isRun
              ? `Mostly carbs, added to ${day}`
              : `${workout} ${when} · protein at ${t.basis.trainingDayProteinGPerKg} g/kg, added to ${day}`}
          </Text>
          <Pressable
            testID="training-day-why"
            accessibilityRole="button"
            accessibilityLabel="Why this training day target"
            onPress={() => {
              setExplainMounted(true);
              setExplainOpen(true);
            }}
            className="min-h-11 justify-center self-start pr-4"
          >
            <Text className="text-xs font-semibold text-primary">Why?</Text>
          </Pressable>
          {explainMounted && (
            <ExplainSheet
              visible={explainOpen}
              onClose={() => setExplainOpen(false)}
              eyebrow={explain.eyebrow}
              title={explain.title}
              sentence={explain.sentence}
              rows={explain.rows}
              footnote={explain.footnote}
              testID="training-explain-sheet"
              action={{
                label: explain.actionLabel,
                onPress: () => {
                  setExplainOpen(false);
                  router.push('/gym/settings');
                },
              }}
            />
          )}
        </>
      ) : (
        <>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
            <Text className="min-w-0 flex-1 text-xs text-gray-600">
              Premium adds this to {day}&apos;s targets
            </Text>
          </View>
          <Pressable
            testID="training-day-upgrade"
            accessibilityRole="button"
            onPress={() => openPremium('training-day')}
            className="min-h-11 justify-center"
          >
            <Text className="text-xs font-semibold text-primary">
              Fit meals to my training days
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
