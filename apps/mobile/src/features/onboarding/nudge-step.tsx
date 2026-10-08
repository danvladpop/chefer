import { View } from 'react-native';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { FoodNudgeSwitches } from '../notifications/food-nudge-switches';
import { useFoodNudgePrefs } from '../notifications/use-food-nudges';
import { ONBOARDING_COPY } from './copy';

// The last onboarding question (UX-PO-08): two switches, both off. It comes
// AFTER everything is saved — answering (or not) only decides what is
// scheduled, never whether the setup counts as done — so it is its own screen
// rather than a numbered step of the wizard.

export function NudgeStep({ onDone }: { onDone: () => void }) {
  const prefs = useFoodNudgePrefs();
  const anyOn = prefs.dinner || prefs.planSunday;
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-1 gap-4 px-4 py-6">
        <View className="gap-1">
          <Text variant="muted" className="text-xs">
            {ONBOARDING_COPY.nudgeTitle}
          </Text>
          <Text testID="onboarding-nudge-title" variant="heading" accessibilityRole="header">
            {ONBOARDING_COPY.nudgeQuestion}
          </Text>
        </View>
        <FoodNudgeSwitches testIDPrefix="onboarding-nudge" />
        <Text variant="muted" className="text-xs">
          {ONBOARDING_COPY.nudgeHint}
        </Text>
      </View>
      <View className="border-t border-border bg-background px-4 pb-2 pt-3">
        <Button testID="onboarding-nudge-done" onPress={onDone}>
          {anyOn ? ONBOARDING_COPY.nudgeDone : ONBOARDING_COPY.nudgeNotNow}
        </Button>
      </View>
    </Screen>
  );
}
