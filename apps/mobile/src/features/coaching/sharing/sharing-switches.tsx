import { Switch, View } from 'react-native';
import { COACHING_SHARING_COPY, type CoachingShareChoice } from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';

// ─── "Share my food log" / "Share my weight" (lane K1) ────────────────────────
// The client's two opt-ins, on the consent screen (join and request) and in Your trainer. The texts are
// consent copy from the shared COACHING_SHARING_COPY (the web renders the same strings): do not reword
// here. Both start off; the caller owns the value (local state before joining, the server after).

export type SharingSwitchesProps = {
  trainerName: string;
  value: CoachingShareChoice;
  onChange: (next: Partial<CoachingShareChoice>) => void;
  disabled?: boolean;
  testID?: string;
};

function SwitchRow({
  label,
  body,
  value,
  onValueChange,
  disabled,
  testID,
}: {
  label: string;
  body: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled: boolean;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="min-w-0 flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-subhead font-semibold text-label">{label}</Text>
        <Text className="text-footnote text-label-secondary">{body}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}

export function SharingSwitches({
  trainerName,
  value,
  onChange,
  disabled = false,
  testID = 'coaching-sharing',
}: SharingSwitchesProps) {
  const copy = COACHING_SHARING_COPY;
  return (
    <View testID={testID} className="gap-3">
      <SwitchRow
        testID={`${testID}-food`}
        label={copy.food.label}
        body={copy.food.body(trainerName)}
        value={value.food}
        disabled={disabled}
        onValueChange={(food) => onChange({ food })}
      />
      <SwitchRow
        testID={`${testID}-weight`}
        label={copy.weight.label}
        body={copy.weight.body(trainerName)}
        value={value.weight}
        disabled={disabled}
        onValueChange={(weight) => onChange({ weight })}
      />
      <Text className="text-footnote text-label-secondary">{copy.footer}</Text>
    </View>
  );
}
