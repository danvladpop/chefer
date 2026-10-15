import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { exit } from '@chefer/tokens';
import {
  duration,
  ENTER_RISE,
  PressableScale,
  Text,
  timing,
  useReducedMotion,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { useActiveSessionRecord } from '../gym/offline/active-session-store';
import { getGymOwner } from '../gym/offline/owner';

// ─── Active-workout mini bar (plan: "Target navigation → the mini bar") ─────
// While a workout runs, a slim bar rides above the tab bar on every tab, the
// way Spotify keeps the playing song one tap away: the workout is never more
// than one tap from anywhere, and leaving it to check the plan costs nothing.
// A "Save for later" workout is parked, not running, so it gets no bar (its
// Resume card is on Train).

// Premium motion #13: the bar rises in (`slow`) when a workout starts and
// sinks away when it ends; a small "live" dot breathes while it runs
// (static under reduced motion).
const barEntering = FadeInDown.duration(duration.slow)
  .withInitialValues({ opacity: 0, transform: [{ translateY: ENTER_RISE * 2 }] })
  .reduceMotion(ReduceMotion.System);
const barExiting = FadeOutDown.duration(exit(duration.slow)).reduceMotion(ReduceMotion.System);

/** The live dot's low point and one half-breath. */
const LIVE_DOT_LOW = 0.35;

function LiveDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(opacity);
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(LIVE_DOT_LOW, timing(duration.deliberate)),
          withTiming(1, timing(duration.deliberate)),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessible={false}
      style={[
        {
          position: 'absolute',
          top: -2,
          right: -3,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

export function WorkoutMiniBar() {
  const record = useActiveSessionRecord();
  const colors = useThemeColors();
  const [now, setNow] = useState(() => Date.now());
  const owner = getGymOwner();
  const running =
    record !== null &&
    record.pausedAt === null &&
    (owner === null || record.ownerId === null || record.ownerId === owner);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;
  const minutes = minutesSince(record.doc.startedAt, now);
  const done = record.doc.exercises.filter((exercise) =>
    exercise.sets.some((set) => set.completedAt !== null),
  ).length;

  return (
    <Animated.View entering={barEntering} exiting={barExiting} className="bg-canvas px-3 pb-2 pt-1">
      <PressableScale
        testID="workout-mini-bar"
        accessibilityRole="button"
        accessibilityLabel={`${record.doc.name}, in progress, ${minutes} minutes`}
        accessibilityHint="Opens your workout"
        onPress={() => router.push('/gym/workout')}
        className="min-h-12 flex-row items-center gap-3 rounded-control bg-brand px-4 py-2 shadow-sm"
      >
        <View>
          <Icon name="timer" color={colors.onBrand} />
          <LiveDot color={colors.onBrand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-callout font-semibold text-brand-on" numberOfLines={1}>
            {record.doc.name}
          </Text>
          <Text className="text-caption text-brand-on/80" numberOfLines={1}>
            {minutes} min · {done} of {record.doc.exercises.length} exercises
          </Text>
        </View>
        <Text className="text-callout font-semibold text-brand-on">Resume</Text>
      </PressableScale>
    </Animated.View>
  );
}
