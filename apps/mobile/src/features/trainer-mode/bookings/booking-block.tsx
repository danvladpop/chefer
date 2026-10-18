import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import { BOOKING_COPY, type TrainerBookingDto } from '@chefer/types';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  bookingBlockLabel,
  bookingTime,
  bookingWhat,
  bookingWho,
  bookingZoneHint,
  cn,
} from '@chefer/utils';
import { trainerBookingHref } from '../open-booking';

// One booking on the calendar (§6.2): its time, client name(s) ("Maria + 1")
// and workout; blocked time greyed and hatched; cancelled greyed; the "In
// Europe/Bucharest time" hint for one made in another zone. A button with the
// full spoken label (§12); tap → booking detail. Compact (week view, narrow
// columns) keeps the time and the first name only.

/** Diagonal stripes for blocked time: a repeating SVG pattern, not an image. */
export function Hatch({ color }: { color: string }) {
  const id = `hatch-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={id}
            patternUnits="userSpaceOnUse"
            width={8}
            height={8}
            patternTransform="rotate(45)"
          >
            <Line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Week view's narrow columns (~35 pt at 320): "18" for 18:00, "18:30" otherwise. */
export function compactTime(time: string): string {
  return time.endsWith(':00') ? time.slice(0, 2) : time;
}

export function BookingBlock({
  booking,
  zone,
  compact = false,
  tall,
}: {
  booking: TrainerBookingDto;
  zone: string;
  compact?: boolean;
  /** Room for more than the first line (the block is at least ~45 minutes tall). */
  tall: boolean;
}) {
  const colors = useThemeColors();
  const blocked = booking.kind === 'BLOCK';
  const cancelled = booking.cancelledAt !== null;
  const muted = blocked || cancelled;
  const startTime = bookingTime(booking.startsAt, zone);
  const who = bookingWho(booking);
  const what = bookingWhat(booking);
  const hint = bookingZoneHint(booking, zone);
  return (
    // MO-01: the block scales on press like every card-sized target.
    <PressableScale
      testID={`schedule-block-${booking.id}`}
      accessibilityRole="button"
      accessibilityLabel={bookingBlockLabel(booking, zone)}
      onPress={() => router.push(trainerBookingHref(booking.id))}
      className={cn(
        'h-full w-full overflow-hidden rounded-inner border-l-4 px-1.5 py-0.5',
        muted ? 'border-separator bg-surface-sunken' : 'border-brand bg-brand-tint',
      )}
    >
      {blocked ? <Hatch color={colors.separator} /> : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        className={cn(
          'text-caption font-semibold',
          muted ? 'text-label-secondary' : 'text-label',
          cancelled && 'line-through',
        )}
      >
        {compact ? compactTime(startTime) : `${startTime} ${who}`}
      </Text>
      {compact && tall ? (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          className="text-caption text-label-secondary"
        >
          {who}
        </Text>
      ) : null}
      {!compact && tall && (what || cancelled) ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="text-caption text-label-secondary"
        >
          {cancelled ? BOOKING_COPY.schedule.cancelled : what}
        </Text>
      ) : null}
      {!compact && tall && hint ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="text-caption text-label-tertiary"
        >
          {hint}
        </Text>
      ) : null}
    </PressableScale>
  );
}
