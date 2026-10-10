import { ActivityIndicator, View } from 'react-native';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';

// The Train screens' buttons in the 10 Oct redesign's roles (the kit Button
// still draws the old palette): `primary` brand fill, `tinted` brand wash,
// `outline` hairline on surface, `ghost` brand text, `danger` danger text,
// and `onBrand` — the white pill on a brand-filled card or header.
// MO-01: PressableScale press feedback; no haptic on plain buttons (MO-01).

export type TrainButtonVariant = 'primary' | 'tinted' | 'outline' | 'ghost' | 'danger' | 'onBrand';

export interface TrainButtonProps {
  label: string;
  onPress: () => void;
  variant?: TrainButtonVariant;
  icon?: IconName;
  /** `pill` = fully rounded (Resume, Finish); default is the control radius. */
  pill?: boolean;
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  className?: string;
  testID?: string;
}

const SURFACE: Record<TrainButtonVariant, string> = {
  primary: 'bg-brand',
  tinted: 'bg-brand-tint',
  outline: 'border border-separator bg-surface',
  ghost: '',
  danger: '',
  onBrand: 'bg-surface',
};

const LABEL: Record<TrainButtonVariant, string> = {
  primary: 'text-brand-on',
  tinted: 'text-brand',
  outline: 'text-label',
  ghost: 'text-brand',
  danger: 'text-danger',
  onBrand: 'text-brand',
};

export function TrainButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  pill = false,
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  className,
  testID,
}: TrainButtonProps) {
  const colors = useThemeColors();
  const tint =
    variant === 'primary'
      ? colors.onBrand
      : variant === 'outline'
        ? colors.label
        : variant === 'danger'
          ? colors.danger
          : colors.brand;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={cn(
        'flex-row items-center justify-center gap-2 px-4',
        size === 'lg' ? 'min-h-12' : 'min-h-11',
        pill ? 'rounded-full' : 'rounded-control',
        SURFACE[variant],
        (disabled || loading) && 'opacity-50',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : icon ? (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Icon name={icon} color={tint} size={18} />
        </View>
      ) : null}
      <Text
        numberOfLines={2}
        className={cn('shrink text-center text-callout font-semibold', LABEL[variant])}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
