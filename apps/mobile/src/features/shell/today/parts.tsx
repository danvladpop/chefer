import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { haptics, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';

// Small building blocks shared by Today, Your day and Stats (10 Oct
// redesign). Colour roles and named text styles only (design drift guard).

/** A screen section's heading ("Next meal", "Training", "Eating"). */
export function SectionTitle({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} accessibilityRole="header" className="text-title3 font-bold text-label">
      {children}
    </Text>
  );
}

/** The redesign's card: a surface on the canvas with a hairline border. */
export function BoardCard({
  children,
  className,
  testID,
}: {
  children: ReactNode;
  className?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      className={cn('gap-3 rounded-card border border-separator bg-surface p-4', className)}
    >
      {children}
    </View>
  );
}

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /** `filled` is the one primary action of a card; `tinted` the rest. */
  variant?: 'filled' | 'tinted';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  className?: string;
  testID?: string;
}

/** A labelled button, icon before the label (MO-01 press via PressableScale). */
export function ActionButton({
  label,
  onPress,
  icon,
  variant = 'tinted',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  className,
  testID,
}: ActionButtonProps) {
  const colors = useThemeColors();
  const tint = variant === 'filled' ? colors.onBrand : colors.brand;
  const off = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={cn(
        'min-h-11 flex-row items-center justify-center gap-2 rounded-control px-4 py-2.5',
        variant === 'filled' ? 'bg-brand' : 'bg-brand-tint',
        disabled && 'opacity-40',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : icon ? (
        <Icon name={icon} color={tint} size={18} />
      ) : null}
      <Text
        numberOfLines={1}
        className={cn(
          'shrink text-callout font-semibold',
          variant === 'filled' ? 'text-brand-on' : 'text-brand',
        )}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/** A full-width row link at a card's foot ("Edit entries ›", "Strength and history ›"). */
export function CardLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className="-mx-4 -mb-4 min-h-12 flex-row items-center justify-between border-t border-separator px-4 py-3"
    >
      <Text className="text-callout font-semibold text-brand">{label}</Text>
      <Icon name="chevronRight" color={colors.brand} size={18} />
    </PressableScale>
  );
}
