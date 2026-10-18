import { useRef } from 'react';
import { Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import type { TrainerBookingDto } from '@chefer/types';
import { haptics, PressableScale, Text } from '@chefer/ui-mobile';
import {
  addDaysLocal,
  cn,
  initialScheduleScrollMinute,
  layoutBookingDay,
  utcToZoned,
  weekdayLongName,
  weekdayName,
  type DayBlock,
} from '@chefer/utils';
import { BookingBlock } from './booking-block';
import { clockOf, MIN_BLOCK_MINUTES, slotTimeAt } from './booking-model';

// The hour grid under Schedule (§6.2): all 24 hours, opening an hour before
// now (06:00 outside 06:00–22:00); the rest of the day by scrolling. Blocks
// sit at their wall-clock minute in the device zone and overlapping ones share
// the column side by side (`layoutBookingDay`). Long-press an empty slot → a new
// booking at that time (15-minute grid). Day: one column; Week: seven, with
// compact blocks and day headers that open the Day view.

/** Points per hour: a 30-minute block is 32 pt — two caption lines. */
export const HOUR_PT = 64;
const GUTTER_PT = 44;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const top = (minute: number) => (minute / 60) * HOUR_PT;

function Blocks({
  blocks,
  zone,
  compact,
}: {
  blocks: DayBlock<TrainerBookingDto>[];
  zone: string;
  compact: boolean;
}) {
  return (
    <>
      {blocks.map((b) => {
        const height = top(Math.max(b.end - b.start, MIN_BLOCK_MINUTES)) - 2;
        return (
          <View
            key={b.item.id}
            style={{
              position: 'absolute',
              top: top(b.start) + 1,
              height,
              left: `${(b.column / b.columns) * 100}%`,
              width: `${100 / b.columns}%`,
              paddingHorizontal: 1,
            }}
          >
            <BookingBlock booking={b.item} zone={zone} compact={compact} tall={height >= 44} />
          </View>
        );
      })}
    </>
  );
}

function DayColumn({
  date,
  bookings,
  zone,
  compact,
  nowMinute,
  onLongPressSlot,
  testID,
}: {
  date: string;
  bookings: readonly TrainerBookingDto[];
  zone: string;
  compact: boolean;
  nowMinute: number | null;
  onLongPressSlot: (date: string, time: string) => void;
  testID: string;
}) {
  const blocks = layoutBookingDay(bookings, date, zone, MIN_BLOCK_MINUTES);
  return (
    <Pressable
      testID={testID}
      // The blocks inside are the accessible buttons; screen readers add with the + button.
      accessible={false}
      delayLongPress={350}
      onLongPress={(e: GestureResponderEvent) => {
        haptics.tick();
        onLongPressSlot(date, slotTimeAt((e.nativeEvent.locationY / HOUR_PT) * 60));
      }}
      className={cn('relative min-w-0 flex-1', compact && 'border-l border-separator')}
      style={{ height: 24 * HOUR_PT }}
    >
      <Blocks blocks={blocks} zone={zone} compact={compact} />
      {nowMinute !== null ? (
        <View
          testID={`${testID}-now`}
          pointerEvents="none"
          className="absolute left-0 right-0 h-0.5 bg-danger"
          style={{ top: top(nowMinute) }}
        />
      ) : null}
    </Pressable>
  );
}

function HourScaffold({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row">
      <View style={{ width: GUTTER_PT }}>
        {HOURS.map((h) => (
          <View key={h} style={{ height: HOUR_PT }}>
            <Text
              maxFontSizeMultiplier={1.2}
              className="-mt-2 pr-1 text-right text-caption text-label-tertiary"
            >
              {h === 0 ? '' : clockOf(h * 60)}
            </Text>
          </View>
        ))}
      </View>
      <View className="relative min-w-0 flex-1">
        {HOURS.map((h) => (
          <View
            key={h}
            pointerEvents="none"
            className="absolute left-0 right-0 border-t border-separator"
            style={{ top: h * HOUR_PT }}
          />
        ))}
        <View className="flex-row">{children}</View>
      </View>
    </View>
  );
}

export type ScheduleGridProps = {
  view: 'day' | 'week';
  /** Day view: the day shown. Week view: any day of the week (its Monday is the first column). */
  date: string;
  weekStart: string;
  today: string;
  zone: string;
  bookings: readonly TrainerBookingDto[];
  onLongPressSlot: (date: string, time: string) => void;
  onOpenDay: (date: string) => void;
};

export function ScheduleGrid({
  view,
  date,
  weekStart,
  today,
  zone,
  bookings,
  onLongPressSlot,
  onOpenDay,
}: ScheduleGridProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const nowMinute = utcToZoned(new Date(), zone).minuteOfDay;
  const days =
    view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));

  return (
    <View className="min-h-0 flex-1">
      {view === 'week' ? (
        <View
          className="flex-row border-b border-separator pb-1"
          style={{ paddingLeft: GUTTER_PT }}
        >
          {days.map((d, i) => {
            const isToday = d === today;
            const dayOfMonth = Number(d.slice(8, 10));
            return (
              // MO-01: press feedback on the header that opens the day.
              <PressableScale
                key={d}
                testID={`schedule-week-day-${d}`}
                accessibilityRole="button"
                accessibilityLabel={`${weekdayLongName(i)} ${dayOfMonth}${isToday ? ', today' : ''}`}
                onPress={() => onOpenDay(d)}
                className="min-h-11 min-w-0 flex-1 items-center justify-center"
              >
                <Text
                  maxFontSizeMultiplier={1.2}
                  className={cn(
                    'text-caption font-semibold',
                    isToday ? 'text-brand' : 'text-label-tertiary',
                  )}
                >
                  {weekdayName(i).slice(0, 2)}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.2}
                  className={cn('text-callout font-bold', isToday ? 'text-brand' : 'text-label')}
                >
                  {dayOfMonth}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        testID={`schedule-${view}-grid`}
        className="min-h-0 flex-1"
        contentContainerClassName="pb-8 pt-3"
        onLayout={() => {
          if (scrolled.current) return;
          scrolled.current = true;
          scrollRef.current?.scrollTo({
            y: top(initialScheduleScrollMinute(days.includes(today), nowMinute)),
            animated: false,
          });
        }}
      >
        <HourScaffold>
          {days.map((d) => (
            <DayColumn
              key={d}
              testID={`schedule-column-${d}`}
              date={d}
              bookings={bookings}
              zone={zone}
              compact={view === 'week'}
              nowMinute={d === today ? nowMinute : null}
              onLongPressSlot={onLongPressSlot}
            />
          ))}
        </HourScaffold>
      </ScrollView>
    </View>
  );
}
