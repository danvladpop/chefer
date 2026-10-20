import {
  bookingIdInputSchema,
  bookingRangeInputSchema,
  cancelBookingInputSchema,
  createBookingInputSchema,
  markAttendanceInputSchema,
  updateBookingInputSchema,
} from '@chefer/types';
import { bookingService } from '../../application/coaching/booking.service.js';
import { trainerProcedure } from '../../lib/coaching-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { router } from '../../lib/trpc.js';

// ─── trainer.bookings.* (docs/prd-2026-10/trainer-mode.md §6.2–§6.4, §9; M3) ──
// The trainer's calendar: bookings and blocked time. Every procedure is
// trainerProcedure; the booking service checks that each named client has an
// ACTIVE link (the single NOT_FOUND "This client isn't available") and that the
// booking is the caller's own (NOT_FOUND "This booking isn't available").
// Thin: handlers only delegate.

const DAY_MS = 24 * 60 * 60 * 1000;
/** New bookings (a series counts once) per trainer per day: far above real use. */
const CREATES_PER_DAY = 200;

export const trainerBookingsRouter = router({
  /** Bookings + blocks overlapping [from, to), cancelled included. */
  range: trainerProcedure
    .input(bookingRangeInputSchema)
    .query(({ ctx, input }) =>
      bookingService.range(ctx.user.id, new Date(input.from), new Date(input.to)),
    ),
  get: trainerProcedure
    .input(bookingIdInputSchema)
    .query(({ ctx, input }) => bookingService.get(ctx.user.id, input.bookingId)),
  create: trainerProcedure.input(createBookingInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('trainer.bookings.create', ctx.user.id, CREATES_PER_DAY, DAY_MS);
    return bookingService.create(ctx.user.id, input);
  }),
  /** A stale `expectedVersion` is CONFLICT with `data.conflict = { kind: 'booking', current }`. */
  update: trainerProcedure
    .input(updateBookingInputSchema)
    .mutation(({ ctx, input }) => bookingService.update(ctx.user.id, input)),
  cancel: trainerProcedure
    .input(cancelBookingInputSchema)
    .mutation(({ ctx, input }) => bookingService.cancel(ctx.user.id, input)),
  markAttendance: trainerProcedure
    .input(markAttendanceInputSchema)
    .mutation(({ ctx, input }) => bookingService.markAttendance(ctx.user.id, input)),
});
