import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, ProgressBar, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { formatClock } from '../../gym/workout/workout-model';
import { TrainButton } from './train-button';

// The live workout's header in the new shell (10 Oct redesign, board
// "Workout"; feedback ref-4): a brand-filled band under the status bar with
// minimise, the workout's name and a white Finish pill, then the elapsed
// time at display size, the sets done of planned and a white-on-brand
// progress bar. No kcal: a gym workout has no calories-burned figure (needs
// API work). ProgressBar animates scaleX (MO-06) and honours reduced motion.

function Elapsed({ startedAt }: { startedAt: string }) {
  const start = Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Number.isFinite(start) ? Math.max(0, (now - start) / 1000) : 0;
  return (
    <Text
      testID="workout-elapsed"
      maxFontSizeMultiplier={1.3}
      className="text-display font-bold text-brand-on"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {formatClock(sec)}
    </Text>
  );
}

export interface WorkoutHeaderProps {
  name: string;
  startedAt: string;
  done: number;
  planned: number;
  finishing: boolean;
  onMinimise: () => void;
  onFinish: () => void;
}

export function WorkoutHeader({
  name,
  startedAt,
  done,
  planned,
  finishing,
  onMinimise,
  onFinish,
}: WorkoutHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="workout-header"
      className="gap-3 rounded-b-sheet bg-brand px-4 pb-4"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center gap-2">
        <IconButton
          testID="workout-minimise"
          accessibilityLabel="Minimise workout"
          className="bg-brand-on/20"
          icon={<Icon name="chevronDown" color={colors.onBrand} />}
          onPress={onMinimise}
        />
        <Text
          testID="workout-title"
          accessibilityRole="header"
          numberOfLines={2}
          className="min-w-0 flex-1 text-headline font-bold text-brand-on"
        >
          {name}
        </Text>
        <TrainButton
          testID="workout-finish"
          variant="onBrand"
          pill
          label="Finish"
          accessibilityLabel="Finish workout"
          loading={finishing}
          onPress={onFinish}
        />
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View accessible>
          <Text className="text-subhead text-brand-on">Time</Text>
          <Elapsed startedAt={startedAt} />
        </View>
        <View
          testID="workout-progress"
          accessible
          accessibilityLabel={`${done} of ${planned} sets done`}
          className="items-end"
        >
          <Text className="text-subhead text-brand-on">Sets</Text>
          <Text maxFontSizeMultiplier={1.3} className="text-title1 font-bold text-brand-on">
            {done}
            <Text className="text-title3 font-semibold text-brand-on">{` / ${planned}`}</Text>
          </Text>
        </View>
      </View>
      <ProgressBar
        testID="workout-progress-bar"
        progress={planned > 0 ? done / planned : 0}
        color={colors.onBrand}
        className="h-2 bg-brand-on/30"
        accessibilityLabel={`${done} of ${planned} sets`}
      />
    </View>
  );
}
