import { z } from 'zod';

// ─── Push notifications (docs/prd-2026-10/trainer-mode.md §7.2, §8.4, §9; M4) ──
// Real push through the Expo push API, held for the store build after 1.0.2
// (it needs the iOS push entitlement and FCM credentials in the binary). Until
// then badges and in-app notices are the only channel.
//
// Rules (§7.2): at most one push per (recipient, kind, actor) per 10 minutes;
// payload `data` carries ids only — never food, weight, calories or the
// trainer's private notes; the visible title/body may name the other person and
// a time. The device's Focus / Do Not Disturb is respected (no quiet hours of
// our own). A push is enqueued (PushOutbox) next to the in-app notice it
// mirrors and sent by the push-delivery worker.

/** §7.2 preference keys. A missing PushPreference row means the default (all on). */
export const PUSH_PREFERENCE_KEYS = [
  'trainer.requests',
  'trainer.clients',
  'trainer.reminders',
  'coaching.requests',
  'coaching.routine',
  'coaching.bookings',
  'coaching.reminders',
  'coaching.loggedWorkout',
  'social.follows',
] as const;
export const pushPreferenceKeySchema = z.enum(PUSH_PREFERENCE_KEYS);
export type PushPreferenceKey = z.infer<typeof pushPreferenceKeySchema>;

/** Who sees a preference row: trainer switches live on trainer You, the rest in Settings → Notifications. */
export const PUSH_PREFERENCE_AUDIENCE: Record<
  PushPreferenceKey,
  'trainer' | 'client' | 'everyone'
> = {
  'trainer.requests': 'trainer',
  'trainer.clients': 'trainer',
  'trainer.reminders': 'trainer',
  'coaching.requests': 'client',
  'coaching.routine': 'client',
  'coaching.bookings': 'client',
  'coaching.reminders': 'client',
  'coaching.loggedWorkout': 'client',
  'social.follows': 'everyone',
};

export const PUSH_PREFERENCE_DEFAULTS: Record<PushPreferenceKey, boolean> = Object.fromEntries(
  PUSH_PREFERENCE_KEYS.map((k) => [k, true]),
) as Record<PushPreferenceKey, boolean>;

/** The events that push (§7.2 table). */
export const PUSH_KINDS = [
  'COACHING_REQUEST_RECEIVED',
  'COACHING_ENDED_FOR_TRAINER',
  'BOOKING_REMINDER_TRAINER',
  'COACHING_REQUEST_ANSWERED',
  'ROUTINE_CHANGED_BY_TRAINER',
  'BOOKING_CHANGED_FOR_CLIENT',
  'BOOKING_REMINDER_CLIENT',
  'COACHED_WORKOUT_LOGGED',
  'SOCIAL_FOLLOW',
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** Which preference switches each kind off. */
export const PUSH_KIND_PREFERENCE: Record<PushKind, PushPreferenceKey> = {
  COACHING_REQUEST_RECEIVED: 'trainer.requests',
  COACHING_ENDED_FOR_TRAINER: 'trainer.clients',
  BOOKING_REMINDER_TRAINER: 'trainer.reminders',
  COACHING_REQUEST_ANSWERED: 'coaching.requests',
  ROUTINE_CHANGED_BY_TRAINER: 'coaching.routine',
  BOOKING_CHANGED_FOR_CLIENT: 'coaching.bookings',
  BOOKING_REMINDER_CLIENT: 'coaching.reminders',
  COACHED_WORKOUT_LOGGED: 'coaching.loggedWorkout',
  SOCIAL_FOLLOW: 'social.follows',
};

/** Where a tap opens (§5.1 "deep links decide the mode"; §7.2 "Opens" column). */
export const PUSH_KIND_MODE: Record<PushKind, 'trainer' | 'personal'> = {
  COACHING_REQUEST_RECEIVED: 'trainer',
  COACHING_ENDED_FOR_TRAINER: 'trainer',
  BOOKING_REMINDER_TRAINER: 'trainer',
  COACHING_REQUEST_ANSWERED: 'personal',
  ROUTINE_CHANGED_BY_TRAINER: 'personal',
  BOOKING_CHANGED_FOR_CLIENT: 'personal',
  BOOKING_REMINDER_CLIENT: 'personal',
  COACHED_WORKOUT_LOGGED: 'personal',
  SOCIAL_FOLLOW: 'personal',
};

/** At most one push per (recipient, kind, actor) in this window (§7.2). */
export const PUSH_THROTTLE_MIN = 10;
/** Expo accepts up to 100 messages per send request and 1000 receipt ids per lookup. */
export const PUSH_SEND_BATCH = 100;
export const PUSH_RECEIPT_BATCH = 1000;
/** Retention (§10): devices unseen this long are pruned; sent outbox rows are deleted this long after sending. */
export const PUSH_RETENTION = { deviceUnseenDays: 90, sentOutboxDays: 7, maxAttempts: 5 } as const;

/**
 * The push's `data` (ids only). The app routes on it: `kind` picks the mode and
 * screen, ids pick the item; details are fetched after the tap.
 */
export const pushDataSchema = z.object({
  /** Tags Chefer pushes so the tap router can tell them from local notifications. */
  app: z.literal('chefer-push'),
  kind: z.enum(PUSH_KINDS),
  bookingId: z.string().max(64).optional(),
  clientId: z.string().max(64).optional(),
  workoutSessionId: z.string().max(64).optional(),
});
export type PushData = z.infer<typeof pushDataSchema>;

// ─── notifications.push.* inputs and outputs ──────────────────────────────────

/** An Expo push token: `ExponentPushToken[…]` (or `ExpoPushToken[…]`). */
export const expoPushTokenSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'Not an Expo push token');

export const registerPushDeviceInputSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(['IOS', 'ANDROID']),
  /** The app version string ("1.0.3"), for support. */
  appVersion: z.string().max(40),
});

export const unregisterPushDeviceInputSchema = z.object({ token: expoPushTokenSchema });

export const setPushPreferenceInputSchema = z.object({
  key: pushPreferenceKeySchema,
  enabled: z.boolean(),
});

export interface PushPreferenceDto {
  key: PushPreferenceKey;
  enabled: boolean;
  audience: 'trainer' | 'client' | 'everyone';
}

export interface PushPreferencesDto {
  preferences: PushPreferenceDto[];
  /** This account has at least one registered device (the switches only matter then). */
  hasDevice: boolean;
}

// ─── Copy (title/body shown on the lock screen; names and times only) ────────

export const PUSH_COPY = {
  requestReceived: (client: string) => ({
    title: 'New coaching request',
    body: `${client} asked you to coach them`,
  }),
  coachingEnded: (client: string) => ({
    title: 'Coaching ended',
    body: `${client} ended coaching`,
  }),
  trainerReminder: (time: string, who: string, what: string | null) => ({
    title: 'Booking in 1 hour',
    body: [`${time} ${who}`, what].filter(Boolean).join(' · '),
  }),
  requestAnswered: (trainer: string, accepted: boolean) => ({
    title: accepted ? 'Coaching request accepted' : 'Coaching request declined',
    body: accepted ? `${trainer} accepted your request` : `${trainer} declined your request`,
  }),
  routineChanged: (trainer: string) => ({
    title: 'Routine updated',
    body: `${trainer} updated your routine`,
  }),
  bookingCreated: (trainer: string, when: string) => ({
    title: 'New booking',
    body: `${trainer} booked you for ${when}`,
  }),
  bookingChanged: (trainer: string, when: string) => ({
    title: 'Booking changed',
    body: `${trainer} moved your booking to ${when}`,
  }),
  bookingCancelled: (trainer: string, when: string) => ({
    title: 'Booking cancelled',
    body: `${trainer} cancelled your booking on ${when}`,
  }),
  clientReminder: (trainer: string) => ({
    title: 'Booking in 1 hour',
    body: `Session with ${trainer} in 1 hour`,
  }),
  coachedWorkout: (trainer: string) => ({
    title: 'Workout logged',
    body: `${trainer} logged today’s workout for you`,
  }),
  followRequest: (name: string) => ({
    title: 'Follow request',
    body: `${name} wants to follow you`,
  }),
  newFollower: (name: string) => ({ title: 'New follower', body: `${name} started following you` }),
  settings: {
    title: 'Push notifications',
    trainerTitle: 'Trainer notifications',
    labels: {
      'trainer.requests': 'Coaching requests',
      'trainer.clients': 'Clients leaving',
      'trainer.reminders': 'Booking reminders',
      'coaching.requests': 'Answers to my coaching requests',
      'coaching.routine': 'My trainer changed my routine',
      'coaching.bookings': 'Bookings',
      'coaching.reminders': 'Booking reminders',
      'coaching.loggedWorkout': 'Workouts my trainer logged',
      'social.follows': 'Follow requests and new followers',
    } satisfies Record<PushPreferenceKey, string>,
    deviceOff: 'Notifications are off for Chefer in your phone’s settings.',
    openSettings: 'Open settings',
  },
} as const;
