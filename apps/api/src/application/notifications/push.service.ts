import {
  pushDeviceRepository,
  pushOutboxRepository,
  pushPreferenceRepository,
  socialProfileRepository,
  type IPushDeviceRepository,
  type IPushOutboxRepository,
  type IPushPreferenceRepository,
  type ISocialProfileRepository,
  type PushDbClient,
  type PushDeviceSummary,
} from '@chefer/database';
import {
  PUSH_COPY,
  PUSH_KIND_PREFERENCE,
  PUSH_PREFERENCE_AUDIENCE,
  PUSH_PREFERENCE_DEFAULTS,
  PUSH_PREFERENCE_KEYS,
  PUSH_THROTTLE_MIN,
  pushDataSchema,
  type PushData,
  type PushKind,
  type PushPreferenceKey,
  type PushPreferencesDto,
} from '@chefer/types';
import { displayNameOf } from '@chefer/utils';

// ─── Push notifications: enqueue, devices, switches (trainer-mode.md §7.2, §9; M4) ──
// The outbox pattern: an event writes a PushOutbox row next to the in-app
// notice it mirrors (inside the same transaction when the caller has one —
// pass `db`), and push-delivery.worker sends it. `enqueue` decides whether a
// push is due at all, in this order:
//   1. the recipient's switch for the kind (PUSH_KIND_PREFERENCE; no row = on);
//   2. the recipient has a registered device (no device, no row);
//   3. the throttle: one push per (recipient, kind, actor) per PUSH_THROTTLE_MIN
//      minutes — five routine saves in a row send one push. Booking reminders
//      are exempt: they are one per booking, start time and recipient, by key;
//   4. the row, idempotent on `dedupeKey` (a retried or racing write is a no-op).
// `data` is ids only (pushDataSchema strips anything else): never food,
// weight, calories or a trainer's private note. The title and body name the
// other person and a time, nothing more.
//
// No env, no logger here: this module is reached from gym and coaching code
// whose unit tests load no env (the Expo client lives in infrastructure/push).

const MINUTE_MS = 60_000;
const REMINDER_KINDS: ReadonlySet<PushKind> = new Set([
  'BOOKING_REMINDER_CLIENT',
  'BOOKING_REMINDER_TRAINER',
]);

/** What a push shows and carries. `data` holds ids only (the kind and app tag are added here). */
export interface PushMessageInput {
  title: string;
  body: string;
  data?: Omit<PushData, 'app' | 'kind'>;
}

export interface PushEnqueueInput {
  /** Recipient. */
  userId: string;
  kind: PushKind;
  /** Who caused it (the throttle key); null for a reminder. */
  actorId: string | null;
  payload: PushMessageInput;
  /**
   * Reminders only: the event's identity (booking id + start), so the
   * per-minute reminder sweep enqueues each reminder once.
   */
  eventKey?: string;
}

export type PushEnqueueOutcome = 'queued' | 'off' | 'no_device' | 'throttled' | 'duplicate';

/** The stored outbox payload (the worker parses it back). */
export interface PushOutboxPayload {
  title: string;
  body: string;
  data: PushData;
}

export interface RegisterPushDeviceInput {
  token: string;
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
}

export interface PushServiceDeps {
  devices: Pick<IPushDeviceRepository, 'register' | 'unregister' | 'hasDevice' | 'listForExport'>;
  preferences: Pick<IPushPreferenceRepository, 'list' | 'find' | 'set'>;
  outbox: Pick<IPushOutboxRepository, 'enqueue' | 'recentForThrottle'>;
  users: Pick<ISocialProfileRepository, 'findUsers'>;
  now: () => Date;
}

const defaultDeps: PushServiceDeps = {
  devices: pushDeviceRepository,
  preferences: pushPreferenceRepository,
  outbox: pushOutboxRepository,
  users: socialProfileRepository,
  now: () => new Date(),
};

/** The deterministic idempotency key of one push event. */
export function pushDedupeKey(input: PushEnqueueInput, now: Date): string {
  if (REMINDER_KINDS.has(input.kind)) {
    return `reminder:${input.userId}:${input.eventKey ?? 'none'}`;
  }
  // Non-reminders: one row per throttle window and (recipient, kind, actor).
  const window = Math.floor(now.getTime() / (PUSH_THROTTLE_MIN * MINUTE_MS));
  return `${input.kind}:${input.userId}:${input.actorId ?? '-'}:${window}`;
}

export class PushService {
  private readonly deps: PushServiceDeps;

  constructor(deps: Partial<PushServiceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** Enqueue one push (see the header for the rules). Pass `db` to join the caller's transaction. */
  async enqueue(input: PushEnqueueInput, db?: PushDbClient): Promise<PushEnqueueOutcome> {
    if (input.actorId !== null && input.actorId === input.userId) return 'off';
    const stored = await this.deps.preferences.find(
      input.userId,
      PUSH_KIND_PREFERENCE[input.kind],
      db,
    );
    if (!(stored ?? PUSH_PREFERENCE_DEFAULTS[PUSH_KIND_PREFERENCE[input.kind]])) return 'off';
    if (!(await this.deps.devices.hasDevice(input.userId, db))) return 'no_device';

    const now = this.deps.now();
    if (!REMINDER_KINDS.has(input.kind)) {
      const since = new Date(now.getTime() - PUSH_THROTTLE_MIN * MINUTE_MS);
      const recent = await this.deps.outbox.recentForThrottle(
        input.userId,
        input.kind,
        input.actorId,
        since,
        db,
      );
      if (recent > 0) return 'throttled';
    }

    const payload: PushOutboxPayload = {
      title: input.payload.title,
      body: input.payload.body,
      // Strips anything but the known id fields: a push never carries details.
      data: pushDataSchema.parse({ ...input.payload.data, app: 'chefer-push', kind: input.kind }),
    };
    const created = await this.deps.outbox.enqueue(
      {
        userId: input.userId,
        kind: input.kind,
        actorId: input.actorId,
        payload: { ...payload, data: { ...payload.data } },
        dedupeKey: pushDedupeKey(input, now),
      },
      db,
    );
    return created ? 'queued' : 'duplicate';
  }

  /** Following (§7.2 "Follow request / new follower"): `actorId` asked to follow, or followed, `recipientId`. */
  async follow(
    recipientId: string,
    actorId: string,
    variant: 'REQUEST' | 'NEW_FOLLOWER',
    db?: PushDbClient,
  ): Promise<PushEnqueueOutcome> {
    const [actor] = await this.deps.users.findUsers([actorId]);
    const name = actor ? displayNameOf(actor) : displayNameOf({});
    return this.enqueue(
      {
        userId: recipientId,
        kind: 'SOCIAL_FOLLOW',
        actorId,
        payload:
          variant === 'REQUEST' ? PUSH_COPY.followRequest(name) : PUSH_COPY.newFollower(name),
      },
      db,
    );
  }

  // ─── notifications.push.* ──────────────────────────────────────────────────

  async register(userId: string, input: RegisterPushDeviceInput): Promise<{ ok: true }> {
    await this.deps.devices.register({
      userId,
      token: input.token,
      platform: input.platform,
      appVersion: input.appVersion,
      now: this.deps.now(),
    });
    return { ok: true };
  }

  async unregister(userId: string, token: string): Promise<{ ok: true }> {
    await this.deps.devices.unregister(userId, token);
    return { ok: true };
  }

  async preferences(userId: string): Promise<PushPreferencesDto> {
    const [rows, hasDevice] = await Promise.all([
      this.deps.preferences.list(userId),
      this.deps.devices.hasDevice(userId),
    ]);
    const stored = new Map(rows.map((r) => [r.key, r.enabled]));
    return {
      preferences: PUSH_PREFERENCE_KEYS.map((key) => ({
        key,
        enabled: stored.get(key) ?? PUSH_PREFERENCE_DEFAULTS[key],
        audience: PUSH_PREFERENCE_AUDIENCE[key],
      })),
      hasDevice,
    };
  }

  async setPreference(
    userId: string,
    key: PushPreferenceKey,
    enabled: boolean,
  ): Promise<PushPreferencesDto> {
    await this.deps.preferences.set(userId, key, enabled);
    return this.preferences(userId);
  }

  /** GDPR export: devices without their tokens, and the switches as they apply. */
  async exportData(userId: string): Promise<{
    devices: PushDeviceSummary[];
    preferences: { key: PushPreferenceKey; enabled: boolean }[];
  }> {
    const [devices, prefs] = await Promise.all([
      this.deps.devices.listForExport(userId),
      this.preferences(userId),
    ]);
    return {
      devices,
      preferences: prefs.preferences.map(({ key, enabled }) => ({ key, enabled })),
    };
  }
}

export const pushService = new PushService();
