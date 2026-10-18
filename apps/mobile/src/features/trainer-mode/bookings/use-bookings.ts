import { useCallback } from 'react';
import { bookingWeekRange } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';

// ─── Booking queries and the one "something changed" refresh (§6.2, §7.3, §12) ──
// The schedule asks `trainer.bookings.range` once per visible week (cached by
// the week's input, so moving between days of a week makes no round trip).
// After any create / edit / cancel / attendance change every view that shows
// bookings is refreshed: the calendar, booking detail, Today's booking parts,
// the client's Bookings tab, the clients' "next booking" and the badges. The
// local reminders follow on their own (they read the same queries).

/** One week of the calendar in the device zone. */
export function useBookingWeek(weekStart: string, zone: string) {
  return trpc.trainer.bookings.range.useQuery(bookingWeekRange(weekStart, zone), {
    retry: false,
    staleTime: 30_000,
  });
}

export function useInvalidateBookings(): () => Promise<void> {
  const utils = trpc.useUtils();
  return useCallback(async () => {
    await Promise.all([
      utils.trainer.bookings.invalidate(),
      utils.trainer.dashboard.summary.invalidate(),
      utils.trainer.client.bookings.invalidate(),
      utils.trainer.clients.list.invalidate(),
      utils.trainer.badges.invalidate(),
    ]);
  }, [utils]);
}
