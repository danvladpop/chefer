import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { PressableScale } from '../motion/pressable-scale';
import { Text } from './text';

// The revamp's one card (plan: "Card — one radius (16), one padding"): a
// flat surface on the canvas, no border, no shadow (only floating things get
// elevation). Optional title row with a trailing action; pressable as a
// whole when `onPress` is given (MO-01 `card` scale).

export interface SurfaceCardProps {
  children?: ReactNode;
  title?: string;
  /** A trailing node in the title row, e.g. a "See all" link. */
  action?: ReactNode;
  /** `brand` is the one emphasised card on a screen (Up next). */
  tone?: 'default' | 'brand';
  onPress?: () => void;
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
}

export function SurfaceCard({
  children,
  title,
  action,
  tone = 'default',
  onPress,
  accessibilityLabel,
  className,
  testID,
}: SurfaceCardProps) {
  const classes = cn(
    'gap-3 rounded-card p-4',
    tone === 'brand' ? 'bg-brand-tint' : 'bg-surface',
    className,
  );
  const content = (
    <>
      {title || action ? (
        <View className="flex-row items-center justify-between gap-3">
          {title ? (
            <Text
              accessibilityRole="header"
              className="min-w-0 flex-1 text-headline font-semibold text-label"
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        pressScale="card"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        className={classes}
      >
        {content}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} className={classes}>
      {content}
    </View>
  );
}
