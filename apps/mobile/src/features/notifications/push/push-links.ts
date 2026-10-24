import { router, type Href } from 'expo-router';
import { PUSH_KIND_MODE, pushDataSchema, type PushData } from '@chefer/types';
import { track } from '../../../lib/analytics';
import { trainingHomeHref } from '../../coaching/routes';
import {
  getShellMode,
  isTrainerModeAvailableCached,
  setShellMode,
} from '../../trainer-mode/mode-store';
import { openBookingInMode } from '../../trainer-mode/open-booking';
import { personalHomeHref, TRAINER_TODAY_HREF } from '../../trainer-mode/switch-mode';

// ─── Where a tapped push opens (trainer-mode.md §5.1, §7.2 "Opens") ───────────
// The push carries ids only (`pushDataSchema`, tagged `app: 'chefer-push'`);
// its kind picks the mode and the screen. The shell is switched FIRST (its
// Today replaces the stack), then the screen is pushed on top, so Back lands
// in the right mode — the same rule as open-booking.ts, which the booking
// kinds reuse. A trainer kind on a device without trainer mode (flag off,
// tools turned off) opens personal mode's Trainer tools instead.

/** The Chefer push a notification carries, or null for anything else (local notifications included). */
export function pushNotificationTarget(data: unknown): PushData | null {
  const parsed = pushDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const TRAINER_CLIENTS_HREF = '/(trainer)/clients';
/** Personal mode's way into the trainer's clients and requests (Trainer tools). */
const TRAINER_TOOLS_HREF = '/trainer';
const YOUR_TRAINER_HREF = '/coaching';
const FOLLOWING_ACTIVITY_HREF = '/friends/activity';

/** Switches to personal mode (landing on its Today) unless the device is already in it. */
function enterPersonalMode(): void {
  if (getShellMode() === 'personal') return;
  setShellMode('personal');
  router.replace(personalHomeHref());
}

function openTrainerPush(push: PushData): void {
  if (push.kind === 'BOOKING_REMINDER_TRAINER' && push.bookingId) {
    openBookingInMode({ role: 'trainer', bookingId: push.bookingId });
    return;
  }
  if (!isTrainerModeAvailableCached()) {
    enterPersonalMode();
    router.push(TRAINER_TOOLS_HREF);
    return;
  }
  if (getShellMode() !== 'trainer') {
    setShellMode('trainer');
    // Clients is a tab of the trainer shell: landing on it IS the switch.
    router.replace(
      push.kind === 'BOOKING_REMINDER_TRAINER' ? TRAINER_TODAY_HREF : TRAINER_CLIENTS_HREF,
    );
    return;
  }
  router.navigate(
    push.kind === 'BOOKING_REMINDER_TRAINER' ? TRAINER_TODAY_HREF : TRAINER_CLIENTS_HREF,
  );
}

function personalHref(push: PushData): Href {
  switch (push.kind) {
    case 'COACHING_REQUEST_ANSWERED':
      return YOUR_TRAINER_HREF;
    case 'ROUTINE_CHANGED_BY_TRAINER':
      return trainingHomeHref();
    case 'BOOKING_CHANGED_FOR_CLIENT':
    case 'BOOKING_REMINDER_CLIENT':
      // Without a booking id (never sent today): the bookings list on Your trainer.
      return YOUR_TRAINER_HREF;
    case 'COACHED_WORKOUT_LOGGED':
      return push.workoutSessionId ? `/gym/session/${push.workoutSessionId}` : trainingHomeHref();
    default:
      return FOLLOWING_ACTIVITY_HREF;
  }
}

function openPersonalPush(push: PushData): void {
  const booking =
    push.kind === 'BOOKING_CHANGED_FOR_CLIENT' || push.kind === 'BOOKING_REMINDER_CLIENT';
  if (booking && push.bookingId) {
    openBookingInMode({ role: 'client', bookingId: push.bookingId });
    return;
  }
  const href = personalHref(push);
  enterPersonalMode();
  // Train is a tab of the personal shell: navigate (no second copy on the stack).
  if (href === trainingHomeHref()) router.navigate(href);
  else router.push(href);
}

/** Opens what a tapped Chefer push is about, in the mode its kind belongs to. */
export function openPushNotification(push: PushData): void {
  track('push_opened', { kind: push.kind });
  if (PUSH_KIND_MODE[push.kind] === 'trainer') openTrainerPush(push);
  else openPersonalPush(push);
}
