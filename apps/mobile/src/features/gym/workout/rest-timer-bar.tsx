import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@chefer/ui-mobile';
import { adjustRest, REST_ADJUST_STEP_SEC, skipRest, useRestRemaining } from '../rest-timer';
import { hapticRestDone } from './haptics';
import { formatClock } from './workout-model';

// Sticky rest bar (gym_plan.md §1.3). The ONLY subscriber to the 4×/s tick —
// the workout list never re-renders because a timer is running.

export function RestTimerBar() {
  const insets = useSafeAreaInsets();
  const { remainingSec, state } = useRestRemaining(hapticRestDone);
  if (!state) return null;
  const progress = state.durationSec > 0 ? 1 - remainingSec / state.durationSec : 1;

  return (
    <View
      testID="rest-timer"
      className="absolute bottom-0 left-0 right-0 border-t border-border bg-card"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="h-1 bg-muted">
        <View
          className="h-1 bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </View>
      <View className="flex-row items-center gap-2 px-3 pt-2">
        <View className="min-w-0 flex-1">
          <Text variant="muted" className="text-xs">
            Rest
          </Text>
          <Text
            testID="rest-timer-remaining"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Rest, ${remainingSec} seconds left`}
            className="text-2xl font-bold tabular-nums"
          >
            {formatClock(remainingSec)}
          </Text>
        </View>
        <TimerButton
          testID="rest-timer-minus"
          label={`−${REST_ADJUST_STEP_SEC}`}
          a11y="15 seconds less rest"
          onPress={() => adjustRest(-REST_ADJUST_STEP_SEC)}
        />
        <TimerButton
          testID="rest-timer-plus"
          label={`+${REST_ADJUST_STEP_SEC}`}
          a11y="15 seconds more rest"
          onPress={() => adjustRest(REST_ADJUST_STEP_SEC)}
        />
        <TimerButton
          testID="rest-timer-skip"
          label="Skip"
          a11y="Skip rest"
          onPress={skipRest}
          primary
        />
      </View>
    </View>
  );
}

function TimerButton({
  testID,
  label,
  a11y,
  onPress,
  primary = false,
}: {
  testID: string;
  label: string;
  a11y: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className={`h-12 min-w-14 items-center justify-center rounded-xl px-3 active:opacity-70 ${
        primary ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <Text
        className={`text-base font-semibold ${primary ? 'text-primary-foreground' : 'text-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Elapsed time since `startedAt`, ticking once a second in its own component. */
export function ElapsedTime({ startedAt, testID }: { startedAt: string; testID: string }) {
  const start = Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Number.isFinite(start) ? (now - start) / 1000 : 0;
  return (
    <Text testID={testID} className="text-sm tabular-nums text-muted-foreground">
      {formatClock(sec)}
    </Text>
  );
}
