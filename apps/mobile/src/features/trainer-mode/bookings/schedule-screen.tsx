import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BOOKING_COPY } from '@chefer/types';
import {
  DayStrip,
  ErrorState,
  IconButton,
  PressableScale,
  Screen,
  SegmentedControl,
  Text,
  useSnackbar,
  useThemeColors,
  type DayStripDay,
} from '@chefer/ui-mobile';
import {
  addDaysLocal,
  deviceTimeZone,
  formatDayWithWeekday,
  layoutBookingDay,
  todayIn,
  weekdayLongName,
  weekdayName,
  weekStartOf,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { ShellChromeProvider, ShellTopBar } from '../../shell/shell-chrome';
import { clockTime } from '../today/today-parts';
import { useBookingEditor } from './booking-editor';
import { ScheduleGrid } from './schedule-grid';
import { useBookingWeek } from './use-bookings';

// ─── Schedule (docs/prd-2026-10/trainer-mode.md §6.2) ─────────────────────────
// The trainer's calendar in the device zone. Day (default) and Week; a day
// strip (Day) or tappable day headers (Week) move between days, ‹ › between
// weeks. One `trainer.bookings.range` per visible week, cached, so moving
// between days of a week makes no round trip; offline the cached week stays
// with a "Last updated" line. Create with + or a long-press on an empty
// slot (the editor opens at that time); creating needs a connection.

const COPY = BOOKING_COPY.schedule;

function stripDays(weekStart: string, today: string): DayStripDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysLocal(weekStart, i);
    return {
      key: date,
      weekday: weekdayName(i),
      date: Number(date.slice(8, 10)),
      accessibilityLabel: `${weekdayLongName(i)} ${formatDayWithWeekday(date).slice(4)}`,
      isToday: date === today,
    };
  });
}

/** "20 – 26 Oct" for the week header. */
function weekLabel(weekStart: string): string {
  const first = formatDayWithWeekday(weekStart).slice(4);
  const last = formatDayWithWeekday(addDaysLocal(weekStart, 6)).slice(4);
  return `${first} – ${last}`;
}

export function ScheduleScreen() {
  const colors = useThemeColors();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const [zone] = useState(deviceTimeZone);
  const [today, setToday] = useState(() => todayIn(zone));
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState(today);
  const weekStart = weekStartOf(selected);
  const week = useBookingWeek(weekStart, zone);
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const editor = useBookingEditor();

  // A new calendar day while the tab sat in the background.
  useFocusEffect(
    useCallback(() => {
      const now = todayIn(zone);
      setToday((prev) => (prev === now ? prev : now));
    }, [zone]),
  );

  const openNew = (date: string, time?: string) => {
    if (!online) {
      snackbar.show({ message: COPY.offline });
      return;
    }
    // + without a long-pressed time: the next full hour today, 18:00 on other days (newBookingSlot).
    editor.open({
      kind: 'new',
      prefill: { date, ...(time ? { time } : {}), location: status.data?.gymLine ?? null },
    });
  };

  const add = (
    <IconButton
      testID="schedule-add"
      accessibilityLabel={COPY.add}
      variant="tinted"
      icon={<Icon name="add" color={colors.brand} />}
      onPress={() => openNew(selected < today ? today : selected)}
    />
  );

  const stale = week.data !== undefined && (week.isRefetchError || week.fetchStatus === 'paused');
  const bookings = week.data?.bookings ?? [];

  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: COPY.title, actions: add }}>
      <Screen className="bg-canvas px-0" testID="trainer-schedule">
        <View className="gap-3 px-4 pt-3">
          <ShellTopBar />
          <SegmentedControl<'day' | 'week'>
            testID="schedule-view"
            accessibilityLabel={COPY.title}
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: COPY.day, testID: 'schedule-view-day' },
              { value: 'week', label: COPY.week, testID: 'schedule-view-week' },
            ]}
          />
          <View className="flex-row items-center gap-1">
            <IconButton
              testID="schedule-prev-week"
              accessibilityLabel="Previous week"
              icon={<Icon name="chevronBack" color={colors.brand} />}
              onPress={() => setSelected(addDaysLocal(selected, -7))}
            />
            <Text
              testID="schedule-week-label"
              accessibilityRole="header"
              numberOfLines={1}
              className="min-w-0 flex-1 text-center text-headline font-semibold text-label"
            >
              {view === 'day' ? formatDayWithWeekday(selected) : weekLabel(weekStart)}
            </Text>
            <IconButton
              testID="schedule-next-week"
              accessibilityLabel="Next week"
              icon={<Icon name="chevronRight" color={colors.brand} />}
              onPress={() => setSelected(addDaysLocal(selected, 7))}
            />
            {selected !== today ? (
              // MO-01: press feedback on the jump back to today.
              <PressableScale
                testID="schedule-today"
                accessibilityRole="button"
                onPress={() => setSelected(today)}
                className="min-h-11 justify-center px-2"
              >
                <Text className="text-callout font-semibold text-brand">{COPY.today}</Text>
              </PressableScale>
            ) : null}
          </View>
          {view === 'day' ? (
            <DayStrip
              testID="schedule-days"
              days={stripDays(weekStart, today)}
              selectedKey={selected}
              onSelect={setSelected}
            />
          ) : null}
          {stale ? (
            <Text testID="schedule-last-updated" className="text-caption text-label-secondary">
              {COPY.lastUpdated(clockTime(week.dataUpdatedAt))}
            </Text>
          ) : null}
          {view === 'day' &&
          week.data &&
          layoutBookingDay(bookings, selected, zone).length === 0 ? (
            <Text testID="schedule-empty" className="text-subhead text-label-secondary">
              {COPY.empty}
            </Text>
          ) : null}
        </View>

        {week.isPending ? (
          <View testID="schedule-loading" className="items-center py-10">
            <ActivityIndicator />
          </View>
        ) : week.isError && !week.data ? (
          <ErrorState testID="schedule-error" onRetry={() => void week.refetch()} />
        ) : (
          <ScheduleGrid
            view={view}
            date={selected}
            weekStart={weekStart}
            today={today}
            zone={zone}
            bookings={bookings}
            onLongPressSlot={(date, time) => openNew(date, time)}
            onOpenDay={(date) => {
              setSelected(date);
              setView('day');
            }}
          />
        )}
        {editor.sheet}
      </Screen>
    </ShellChromeProvider>
  );
}
