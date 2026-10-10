import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { Text } from './text';

// One number with its name (10 Oct redesign, ref-6 layout): a tinted icon
// disc, the value, a short caption. Used three across (StatTiles) on Today's
// training card, the workout summary and Stats. An estimate says so in its
// caption ("kcal burned, estimate") — the tile never hides that a number is
// approximate.

export interface StatTileProps {
  /** The icon, already sized (~18pt) and tinted brand by the caller. */
  icon?: ReactNode;
  value: string;
  /** A unit drawn smaller after the value, e.g. "min". */
  unit?: string;
  label: string;
  /** Replaces the default "{label}: {value} {unit}" — e.g. to spell out an estimate. */
  accessibilityLabel?: string;
  /** Where the number comes from, e.g. how an estimate was made. */
  accessibilityHint?: string;
  testID?: string;
}

export function StatTile({
  icon,
  value,
  unit,
  label,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: StatTileProps) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}${unit ? ` ${unit}` : ''}`}
      accessibilityHint={accessibilityHint}
      className="min-w-0 flex-1 items-center gap-1 rounded-card border border-separator bg-surface px-2 py-3"
    >
      {icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-tint">
          {icon}
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        className="text-title2 font-bold text-label"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
        {unit ? <Text className="text-subhead font-semibold text-label"> {unit}</Text> : null}
      </Text>
      <Text numberOfLines={2} className="text-center text-caption text-label-secondary">
        {label}
      </Text>
    </View>
  );
}

export interface StatTilesProps {
  children: ReactNode;
  className?: string;
  testID?: string;
}

/** A row of `StatTile`s, equal widths. */
export function StatTiles({ children, className, testID }: StatTilesProps) {
  return (
    <View testID={testID} className={cn('flex-row gap-2', className)}>
      {children}
    </View>
  );
}
