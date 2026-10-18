import { router } from 'expo-router';
import { getShellMode, isTrainerModeAvailableCached, setShellMode } from './mode-store';
import { personalHomeHref, TRAINER_TODAY_HREF } from './switch-mode';

// §5.1 "Deep links decide the mode": a reminder (or link) about the trainer's
// own bookings opens trainer mode, one about the user's own session opens
// personal mode. The shell is switched FIRST (its Today replaces the current
// stack), then the booking is pushed on top, so Back lands in the right mode.

export function trainerBookingHref(bookingId: string): string {
  return `/trainer/bookings/${bookingId}`;
}

/** The coached workout logger for a booking (§6.7; the route is the coach lane's). */
export function coachHref(bookingId: string): string {
  return `/trainer/coach/${bookingId}`;
}

export function clientBookingHref(bookingId: string): string {
  return `/coaching/bookings/${bookingId}`;
}

export function openBookingInMode(target: { role: 'client' | 'trainer'; bookingId: string }): void {
  const trainer = target.role === 'trainer';
  const detail = trainer
    ? trainerBookingHref(target.bookingId)
    : clientBookingHref(target.bookingId);
  // No trainer mode on this device (any more): the detail answers for itself.
  const mode = trainer && isTrainerModeAvailableCached() ? 'trainer' : 'personal';
  if (getShellMode() !== mode) {
    setShellMode(mode);
    router.replace(mode === 'trainer' ? TRAINER_TODAY_HREF : personalHomeHref());
  }
  router.push(detail);
}
