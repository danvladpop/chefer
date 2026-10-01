import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { DENSE_MAX_FONT_SCALE, Text } from './text';

export type CountPillProps = {
  count: number;
  /** Counts above this show as `{max}+`. UX §3.1 caps at 9. */
  max?: number;
  /** Defaults to `{count} new`. Read the real count, never the capped text. */
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
};

/** Text shown inside the pill: the count, or `{max}+` above the cap. */
export function countPillText(count: number, max = 9): string {
  return count > max ? `${max}+` : String(count);
}

/**
 * Small count badge (pending requests, unread Activity). Renders nothing at 0
 * (or for a non-finite / negative count). Display-only — not a touch target.
 */
export function CountPill({
  count,
  max = 9,
  accessibilityLabel,
  className,
  testID,
}: CountPillProps) {
  const whole = Number.isFinite(count) ? Math.floor(count) : 0;
  if (whole <= 0) return null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${whole} new`}
      className={cn(
        'min-h-5 min-w-5 items-center justify-center self-start rounded-full bg-primary px-1.5',
        className,
      )}
    >
      <Text
        maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        className="text-xs font-semibold text-primary-foreground"
      >
        {countPillText(whole, max)}
      </Text>
    </View>
  );
}
