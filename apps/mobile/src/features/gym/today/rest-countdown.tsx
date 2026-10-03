import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { useRestRemaining } from '../rest-timer';
import { formatClock } from '../workout/workout-model';

// UX-GYM-09: the rest countdown used to live only on the logger's bottom bar, so
// minimising the workout hid it. This chip puts the same timer on the Resume
// card and the Food Today workout card. It reads the shared rest store (one
// absolute `endsAt`) and ticks in its own component, so nothing around it
// re-renders. Deliberately NOT a live region: a screen reader reads it when
// focused instead of re-announcing every second (the logger announces start,
// 10 s and end).

export function RestCountdown({
  testID = 'rest-countdown',
  className,
}: {
  testID?: string;
  className?: string;
}) {
  const { remainingSec, state } = useRestRemaining();
  if (!state || remainingSec <= 0) return null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Resting, ${remainingSec} seconds left`}
      className={className}
    >
      <Text className="text-sm font-semibold tabular-nums text-primary">
        {`Rest ${formatClock(remainingSec)}`}
      </Text>
    </View>
  );
}
