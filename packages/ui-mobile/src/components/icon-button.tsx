import type { ReactNode } from 'react';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';

// A round icon-only control with a full 44pt hit area (plan: "IconButton,
// HeaderButton"). The label is required: an icon alone says nothing to a
// screen reader, and Apple's Liquid Glass guidance asks for an accessibility
// label on every toolbar icon.

export interface IconButtonProps {
  /** The icon, already sized (~22pt) and tinted by the caller. */
  icon: ReactNode;
  /** What VoiceOver / TalkBack says. Required. */
  accessibilityLabel: string;
  onPress: () => void;
  /** `plain` sits on any background; `tinted` is a brand wash; `filled` is the primary action. */
  variant?: 'plain' | 'tinted' | 'filled';
  disabled?: boolean;
  testID?: string;
  className?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  disabled = false,
  testID,
  className,
}: IconButtonProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full',
        variant === 'tinted' && 'bg-brand-tint',
        variant === 'filled' && 'bg-brand',
        disabled && 'opacity-40',
        className,
      )}
    >
      {icon}
    </PressableScale>
  );
}
