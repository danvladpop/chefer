import { Switch, View } from 'react-native';
import type { CoachingShareChoice } from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';

// ─── "Share my food log" / "Share my weight" (lane K1) ────────────────────────
// The client's two opt-ins, on the consent screen (join and request) and in Your trainer. The texts are
// consent copy from the shared `coaching.sharing.*` catalog (the web renders the same strings): do not reword
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
  const { t } = useT();
  const trainer = trainerName;
  return (
    <View testID={testID} className="gap-3">
      <SwitchRow
        testID={`${testID}-food`}
        label={t('coaching.sharing.food.label')}
        body={t('coaching.sharing.food.body', { trainer })}
        value={value.food}
        disabled={disabled}
        onValueChange={(food) => onChange({ food })}
      />
      <SwitchRow
        testID={`${testID}-weight`}
        label={t('coaching.sharing.weight.label')}
        body={t('coaching.sharing.weight.body', { trainer })}
        value={value.weight}
        disabled={disabled}
        onValueChange={(weight) => onChange({ weight })}
      />
      <Text className="text-footnote text-label-secondary">{t('coaching.sharing.footer')}</Text>
    </View>
  );
}
