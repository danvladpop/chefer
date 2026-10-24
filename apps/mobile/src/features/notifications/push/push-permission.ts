import * as Notifications from 'expo-notifications';
import type { EventMap } from '@chefer/types';
import { track } from '../../../lib/analytics';
import { refreshNotificationPermission } from '../../../lib/use-notification-permission';
import { kv } from '../../gym/offline/kv';
import { requestPushRegistration } from './push-store';

// ─── Asking for notification permission at a moment of value (§7.2, M4) ──────
// Never at launch. Three moments, each at most once per account (device KV,
// wiped on sign-out):
//  - `trainer_mode`: the trainer switches to trainer mode for the first time;
//  - `first_booking`: the first booking card a client sees, or the first
//    booking a trainer makes (the M3 booking-reminder moment, so one OS
//    prompt serves both local reminders and push);
//  - `coaching_request`: right after a client sent a coaching request.
// Only a REAL OS prompt is tracked (`push_permission_prompted {moment}`, then
// granted / denied): already granted, or the OS will not ask again, means no
// prompt and no event. A grant asks the PushRegistrationHost to register.

export type PushPermissionMoment = EventMap['push_permission_prompted']['moment'];

const askedKey = (moment: PushPermissionMoment) => `notifications.push.asked.${moment}`;
/** M3's "asked for booking reminders" flag: the same moment as `first_booking`. */
const LEGACY_BOOKING_ASKED_KEY = 'notifications.booking-reminders.asked';

function wasAsked(moment: PushPermissionMoment): boolean {
  if (kv.getString(askedKey(moment)) === '1') return true;
  return moment === 'first_booking' && kv.getString(LEGACY_BOOKING_ASKED_KEY) === '1';
}

async function readPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return { granted: current.granted, canAskAgain: current.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

// Two moments can land in the same frame (a booking card on the screen a mode
// switch opens): one OS prompt.
let inflight: Promise<boolean> | null = null;

/**
 * Asks for notification permission once per account for `moment`. Resolves
 * whether notifications are allowed afterwards (true without a prompt when
 * they already were).
 */
export function askNotificationPermissionAt(moment: PushPermissionMoment): Promise<boolean> {
  inflight ??= ask(moment).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function ask(moment: PushPermissionMoment): Promise<boolean> {
  const current = await readPermission();
  if (current.granted) {
    requestPushRegistration();
    return true;
  }
  if (wasAsked(moment)) return false;
  kv.setString(askedKey(moment), '1');
  if (!current.canAskAgain) return false;

  track('push_permission_prompted', { moment });
  let granted = false;
  try {
    const answer = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    granted = answer.granted;
  } catch {
    granted = false;
  }
  track(granted ? 'push_permission_granted' : 'push_permission_denied', {});
  refreshNotificationPermission();
  if (granted) requestPushRegistration();
  return granted;
}
