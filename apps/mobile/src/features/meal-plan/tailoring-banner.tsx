import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PlanTailoring } from '@chefer/types';
import { Button, colors, duration, ProgressBar, Text, useReducedMotion } from '@chefer/ui-mobile';
import {
  cn,
  PLAN_TAILORING_COPY,
  shouldShowTailoringBanner,
  tailoringBannerText,
  tailoringProgress,
  type TailoringDayState,
} from '@chefer/utils';

// ─── Live tailoring banner (premium "instant week") ───────────────────────────
// Port of apps/web TailoringBanner: the week is usable at once; this calm
// banner says the chef is still tailoring it (determinate ProgressBar,
// MO-06), confirms briefly when done, and is honest when it stopped early
// with "Tailor the rest". Copy and state rules come from @chefer/utils.

export interface TailoringBannerProps {
  tailoring: PlanTailoring | null | undefined;
  /** The user watched this job run here — DONE is only confirmed then. */
  sawRunning: boolean;
  /** Re-queue the untailored days; omitted = no action. */
  onResume?: (() => void) | undefined;
  resuming?: boolean;
}

const TONE = {
  running: {
    box: 'border-primary/20 bg-accent',
    title: 'text-primary',
    icon: 'restaurant-outline',
    tint: colors.primary,
  },
  done: {
    box: 'border-emerald-200 bg-emerald-50',
    title: 'text-emerald-800',
    icon: 'checkmark-circle-outline',
    tint: colors.success,
  },
  partial: {
    box: 'border-amber-200 bg-amber-50',
    title: 'text-amber-900',
    icon: 'sparkles-outline',
    tint: colors.warning,
  },
  failed: {
    box: 'border-border bg-gray-50',
    title: 'text-gray-800',
    icon: 'sparkles-outline',
    tint: colors.mutedForeground,
  },
} as const;

export function TailoringBanner({
  tailoring,
  sawRunning,
  onResume,
  resuming = false,
}: TailoringBannerProps) {
  // MO-13: a gentle fade on appearance; instant under Reduce Motion.
  const reducedMotion = useReducedMotion();
  const text = tailoringBannerText(tailoring);
  if (!text || !shouldShowTailoringBanner(tailoring, sawRunning)) return null;
  const tone = TONE[text.tone];
  const { done, total, fraction } = tailoringProgress(tailoring);
  const action = text.actionLabel && onResume ? text.actionLabel : null;

  return (
    <Animated.View
      entering={FadeIn.duration(reducedMotion ? 0 : duration.base)}
      testID="plan-tailoring-banner"
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className={cn('mx-4 mb-2 gap-2 rounded-xl border px-3 py-3', tone.box)}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons name={tone.icon} size={16} color={tone.tint} style={{ marginTop: 2 }} />
        <View className="min-w-0 flex-1">
          <Text testID="plan-tailoring-title" className={cn('text-sm font-semibold', tone.title)}>
            {text.title}
            {text.tone === 'running' ? (
              <Text testID="plan-tailoring-count" className="font-normal">
                {` · ${text.detail}`}
              </Text>
            ) : null}
          </Text>
          {text.tone !== 'running' ? (
            <Text className="mt-0.5 text-xs text-gray-700">{text.detail}</Text>
          ) : null}
        </View>
      </View>
      {text.tone === 'running' ? (
        <>
          <ProgressBar
            testID="plan-tailoring-progress"
            progress={fraction}
            accessibilityLabel={`${done} of ${total} days tailored`}
            className="h-1.5 bg-primary/10"
          />
          <Text className="text-xs text-gray-600">{PLAN_TAILORING_COPY.runningHint}</Text>
        </>
      ) : null}
      {action ? (
        <Button
          testID="plan-tailoring-resume"
          variant="outline"
          size="sm"
          loading={resuming}
          onPress={onResume}
          className="self-start bg-white"
        >
          {action}
        </Button>
      ) : null}
    </Animated.View>
  );
}

/**
 * A day chip's live-tailoring marker: ✓ tailored, a filled dot while the chef
 * is on it, a hollow ring while it waits. Null for every other state (the
 * chip keeps its usual "has meals" dot).
 */
export function TailoringDayMark({
  state,
  selected,
}: {
  state: TailoringDayState;
  selected: boolean;
}) {
  if (state === 'tailored') {
    return (
      <Ionicons
        testID="tailor-mark-tailored"
        name="checkmark"
        size={12}
        color={selected ? colors.primaryForeground : colors.success}
      />
    );
  }
  if (state === 'tailoring') {
    return (
      <View
        testID="tailor-mark-tailoring"
        className={cn('h-2 w-2 rounded-full', selected ? 'bg-white' : 'bg-primary')}
      />
    );
  }
  if (state === 'waiting') {
    return (
      <View
        testID="tailor-mark-waiting"
        className={cn(
          'h-2 w-2 rounded-full border',
          selected ? 'border-white/80' : 'border-primary/50',
        )}
      />
    );
  }
  return null;
}
