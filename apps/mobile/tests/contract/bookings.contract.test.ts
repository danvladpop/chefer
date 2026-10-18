import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CoachingNoticeDto, TrainerBookingDto } from '@chefer/types';
import { addDaysLocal, utcToZoned, zonedToUtc } from '@chefer/utils';
import {
  clientAtLevel,
  errorOf,
  finishedWorkoutFrom,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  type CoachApi,
  type CoachUser,
} from './coaching-helpers';

// Trainer mode M3, bookings and coached workouts, through the real API
// (docs/prd-2026-10/trainer-mode.md §6.2–§6.9, §9, §10, §14): create / edit /
// move / cancel a one-off and a weekly booking with both scopes; the client's
// view never names the other client; one BOOKING_CREATED per series; a level-6
// client never meets the new notice kinds; coach.start returns the client's
// prescription; coach.sync writes "Logged by Ana", marks attendance, advances
// progression and notifies; leaving cancels future bookings; authorization,
// CONFLICT and limits; consent v2. Skipped when coaching is off on the API.

const ZONE = 'Europe/Bucharest';
const LEVEL = 8;

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[bookings.contract] ${NO_COACHING_MESSAGE}`);
});

const unread = (list: CoachingNoticeDto[], kind: CoachingNoticeDto['kind']) =>
  list.filter((n) => n.kind === kind && !n.read);

async function joinAsClient(
  trainer: CoachUser,
  firstName: string,
  apiLevel = LEVEL,
): Promise<CoachUser> {
  const client = await makeCoachUser({ prefix: 'bk-client', firstName, gymSetup: true, apiLevel });
  const invite = await trainer.api.trainer.invites.create.mutate({ label: firstName });
  await client.api.coaching.join.mutate({ code: invite.code, localDate: TODAY });
  return client;
}

/** The item at `index`, failing the test when it is missing (no non-null assertions). */
function itemAt<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`expected an item at ${index}, got ${list.length}`);
  return item;
}

/** A local date `days` from today (the API's horizon and "not in the past" are judged against now). */
const day = (days: number) => addDaysLocal(TODAY, days);

async function dismissAll(api: CoachApi) {
  for (const n of await api.coaching.notices.query()) {
    if (!n.read) await api.coaching.dismissNotice.mutate({ id: n.id });
  }
}

describe('trainer mode: bookings and coached workouts (M3)', () => {
  let trainer: CoachUser;
  let maria: CoachUser;
  let ion: CoachUser;
  let old: CoachUser; // a client on an installed level-6 bundle
  let outsider: CoachUser;

  beforeAll(async () => {
    if (!enabled) return;
    trainer = await makeCoachUser({ prefix: 'bk-trainer', firstName: 'Anabk', apiLevel: LEVEL });
    await trainer.api.trainer.activate.mutate({ displayName: 'Ana' });
    maria = await joinAsClient(trainer, 'Maria');
    ion = await joinAsClient(trainer, 'Ion');
    old = await joinAsClient(trainer, 'Olga', 6);
    outsider = await makeCoachUser({ prefix: 'bk-outsider', gymSetup: true, apiLevel: LEVEL });
  });

  it('a one-off booking: create, read, move, stale CONFLICT, cancel; the client is told each time', async () => {
    if (!enabled) return;
    await dismissAll(maria.api);
    const created = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(3),
      time: '18:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: maria.id }],
      location: '  Gym Fit Center ',
      note: 'Bring your belt',
    });
    expect(created).toMatchObject({
      kind: 'BOOKING',
      seriesId: null,
      startsAt: zonedToUtc(day(3), '18:00', ZONE).toISOString(),
      durationMin: 60,
      timeZone: ZONE,
      location: 'Gym Fit Center',
      version: 1,
      cancelledAt: null,
      clients: [
        {
          clientId: maria.id,
          attendance: 'SCHEDULED',
          workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
          workoutSessionId: null,
        },
      ],
    });
    expect(created.clients[0]?.name).toContain('Maria');
    const from = zonedToUtc(day(3), '00:00', ZONE).toISOString();
    const to = zonedToUtc(day(4), '00:00', ZONE).toISOString();
    const range = await trainer.api.trainer.bookings.range.query({ from, to });
    expect(range.bookings.map((b) => b.id)).toContain(created.id);

    // The client: upcoming, the detail, one notice.
    const upcoming = await maria.api.coaching.bookings.upcoming.query();
    expect(upcoming.find((b) => b.id === created.id)).toMatchObject({
      trainer: { name: 'Ana' },
      otherClients: 0,
      note: 'Bring your belt',
      cancelledAt: null,
    });
    expect(await maria.api.coaching.bookings.get.query({ bookingId: created.id })).toMatchObject({
      id: created.id,
    });
    const createdNotices = unread(await maria.api.coaching.notices.query(), 'BOOKING_CREATED');
    expect(createdNotices).toHaveLength(1);
    expect(createdNotices[0]?.booking).toMatchObject({ bookingId: created.id, weekly: false });

    // Move it an hour later.
    const moved = await trainer.api.trainer.bookings.update.mutate({
      bookingId: created.id,
      expectedVersion: 1,
      scope: 'THIS',
      patch: { time: '19:00' },
    });
    expect(moved.version).toBe(2);
    expect(utcToZoned(moved.startsAt, ZONE).time).toBe('19:00');
    expect(unread(await maria.api.coaching.notices.query(), 'BOOKING_CHANGED')).toHaveLength(1);

    // A stale edit is CONFLICT with the booking as stored now.
    const stale = await errorOf(
      trainer.api.trainer.bookings.update.mutate({
        bookingId: created.id,
        expectedVersion: 1,
        patch: { durationMin: 45 },
      }),
    );
    expect(stale.code).toBe('CONFLICT');
    expect(stale.data.conflict?.kind).toBe('booking');
    expect((stale.data.conflict?.current as TrainerBookingDto).version).toBe(2);

    // Cancel: kept (greyed) with the reason; the client sees it until it starts.
    expect(
      await trainer.api.trainer.bookings.cancel.mutate({
        bookingId: created.id,
        reason: 'Sick, sorry',
      }),
    ).toEqual({ ok: true, cancelled: 1 });
    const cancelled = await trainer.api.trainer.bookings.get.query({ bookingId: created.id });
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.clients[0]?.attendance).toBe('CANCELLED');
    const seen = (await maria.api.coaching.bookings.upcoming.query()).find(
      (b) => b.id === created.id,
    );
    expect(seen?.cancelledAt).not.toBeNull();
    expect(seen?.cancelReason).toBe('Sick, sorry');
    const cancelNotice = unread(await maria.api.coaching.notices.query(), 'BOOKING_CANCELLED');
    expect(cancelNotice).toHaveLength(1);
    expect(cancelNotice[0]?.booking?.reason).toBe('Sick, sorry');
    // Cancelling again is a no-op.
    expect(await trainer.api.trainer.bookings.cancel.mutate({ bookingId: created.id })).toEqual({
      ok: true,
      cancelled: 0,
    });
  });

  it('a weekly group booking: one notice per series, no other names, both edit and cancel scopes', async () => {
    if (!enabled) return;
    await dismissAll(maria.api);
    await dismissAll(ion.api);
    const first = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(2),
      time: '18:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: maria.id }, { clientId: ion.id }],
      repeat: { rule: 'WEEKLY', until: day(2 + 21) },
    });
    expect(first.seriesId).not.toBeNull();
    const from = zonedToUtc(day(1), '00:00', ZONE).toISOString();
    const to = zonedToUtc(day(2 + 22), '00:00', ZONE).toISOString();
    const series = async () =>
      (await trainer.api.trainer.bookings.range.query({ from, to })).bookings.filter((b) =>
        b.clients.some((c) => c.clientId === ion.id),
      );
    const rows = await series();
    expect(rows).toHaveLength(4);
    // 18:00 local every week, whatever the UTC offset does in between.
    expect(rows.map((b) => utcToZoned(b.startsAt, ZONE).time)).toEqual([
      '18:00',
      '18:00',
      '18:00',
      '18:00',
    ]);

    // One notice for the whole series.
    const notices = unread(await maria.api.coaching.notices.query(), 'BOOKING_CREATED');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.booking).toMatchObject({ bookingId: first.id, weekly: true });

    // Maria sees the group slot as "with 1 other" and never Ion's name.
    const mine = (await maria.api.coaching.bookings.upcoming.query()).filter(
      (b) => b.startsAt === first.startsAt,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.otherClients).toBe(1);
    const raw = JSON.stringify(await maria.api.coaching.bookings.upcoming.query());
    expect(raw).not.toContain(ion.firstName);
    expect(raw).not.toContain(ion.id);

    // "This and following" from the second occurrence: the series splits.
    const second = itemAt(rows, 1);
    const split = await trainer.api.trainer.bookings.update.mutate({
      bookingId: second.id,
      expectedVersion: second.version,
      scope: 'FOLLOWING',
      patch: { time: '07:00' },
    });
    expect(split.seriesId).not.toBeNull();
    expect(split.seriesId).not.toBe(first.seriesId);
    const after = await series();
    expect(after.map((b) => utcToZoned(b.startsAt, ZONE).time)).toEqual([
      '18:00',
      '07:00',
      '07:00',
      '07:00',
    ]);
    expect(after[0]?.seriesId).toBe(first.seriesId);
    expect(new Set(after.slice(1).map((b) => b.seriesId))).toEqual(new Set([split.seriesId]));

    // "This booking" on the third: only that one changes.
    const third = itemAt(after, 2);
    await trainer.api.trainer.bookings.update.mutate({
      bookingId: third.id,
      expectedVersion: third.version,
      scope: 'THIS',
      patch: { durationMin: 45 },
    });
    expect((await series()).map((b) => b.durationMin)).toEqual([60, 60, 45, 60]);

    // Cancel "this and following" from the third: two cancelled, the rest kept.
    expect(
      await trainer.api.trainer.bookings.cancel.mutate({ bookingId: third.id, scope: 'FOLLOWING' }),
    ).toEqual({ ok: true, cancelled: 2 });
    expect((await series()).map((b) => b.cancelledAt !== null)).toEqual([false, false, true, true]);
    // Cancel one: THIS.
    const firstRow = itemAt(await series(), 0);
    expect(
      await trainer.api.trainer.bookings.cancel.mutate({ bookingId: firstRow.id, scope: 'THIS' }),
    ).toEqual({ ok: true, cancelled: 1 });
  });

  it('a level-6 client never receives the booking notice kinds; the same user at level 8 does', async () => {
    if (!enabled) return;
    await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(4),
      time: '10:00',
      timeZone: ZONE,
      durationMin: 30,
      clients: [{ clientId: old.id }],
    });
    const atSix = await old.api.coaching.notices.query();
    expect(atSix.filter((n) => n.kind.startsWith('BOOKING_'))).toEqual([]);
    expect(JSON.stringify(atSix)).not.toContain('"booking"');
    const atEight = await (await clientAtLevel(old, LEVEL)).coaching.notices.query();
    expect(unread(atEight, 'BOOKING_CREATED')).toHaveLength(1);
    // Level 6 status has no consentUpdate field at all.
    expect('consentUpdate' in (await old.api.coaching.status.query())).toBe(false);
  });

  it('coach.start and coach.sync: the client prescription; Logged by Ana, attendance, progression, a notice', async () => {
    if (!enabled) return;
    await dismissAll(maria.api);
    const routine = await trainer.api.trainer.client.routine.query({
      clientId: maria.id,
      today: TODAY,
    });
    const secondDay = routine?.days[1];
    if (!secondDay) throw new Error('fixture: Maria needs a 2-day routine');

    // No booking: the client's next day.
    const plain = await trainer.api.trainer.coach.start.mutate({
      clientId: maria.id,
      today: TODAY,
    });
    expect(plain.client).toMatchObject({ id: maria.id, unit: 'KG' });
    expect(plain.client.name).toContain('Maria');
    expect(plain.bookingId).toBeNull();
    expect(plain.workout?.exercises.length).toBeGreaterThan(0);
    expect(plain.exercises.map((e) => e.id).sort()).toEqual(
      [...new Set(plain.workout?.exercises.map((e) => e.exerciseId))].sort(),
    );

    // A booking on Maria's second routine day.
    const booking = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(1),
      time: '08:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [
        { clientId: maria.id, workout: { kind: 'ROUTINE_DAY', routineDayId: secondDay.id } },
      ],
    });
    expect(booking.clients[0]?.workout).toEqual({
      kind: 'ROUTINE_DAY',
      routineDayId: secondDay.id,
      name: secondDay.name,
    });
    expect(
      (await maria.api.coaching.bookings.get.query({ bookingId: booking.id })).workoutName,
    ).toBe(secondDay.name);
    const start = await trainer.api.trainer.coach.start.mutate({
      clientId: maria.id,
      bookingId: booking.id,
      today: TODAY,
    });
    expect(start.bookingId).toBe(booking.id);
    expect(start.workout?.dayId).toBe(secondDay.id);
    // The same prescription Maria's own logger gets for that exercise.
    const own = await maria.api.gym.bootstrap.query({ today: TODAY });
    const firstRow = start.workout?.exercises[0];
    if (!firstRow || !start.workout) throw new Error('fixture: an empty workout');
    const before = own.progressions.find((p) => p.exerciseId === firstRow.exerciseId);

    const doc = finishedWorkoutFrom(start.workout, new Date(Date.now() - 60 * 60_000));
    const synced = await trainer.api.trainer.coach.sync.mutate({
      clientId: maria.id,
      docs: [{ ...doc, bookingId: booking.id }],
    });
    expect(synced.results).toEqual([{ id: doc.id, status: 'applied' }]);
    // A re-send changes nothing and notifies nobody twice.
    await trainer.api.trainer.coach.sync.mutate({
      clientId: maria.id,
      docs: [{ ...doc, bookingId: booking.id }],
    });

    // Maria's history: "Logged by Ana" at level 8 only.
    const history = await maria.api.gym.session.list.query({ limit: 5 });
    expect(history.items.find((s) => s.id === doc.id)?.loggedBy).toEqual({ name: 'Ana' });
    const atSix = await (await clientAtLevel(maria, 6)).gym.session.list.query({ limit: 5 });
    expect(atSix.items.find((s) => s.id === doc.id)).not.toHaveProperty('loggedBy');
    // The trainer's view: "Logged by you".
    const workouts = await trainer.api.trainer.client.workouts.query({
      clientId: maria.id,
      limit: 5,
    });
    expect(workouts.items.find((w) => w.id === doc.id)?.loggedByTrainer).toBe(true);

    // Attendance marked by the finish.
    const marked = await trainer.api.trainer.bookings.get.query({ bookingId: booking.id });
    expect(marked.clients[0]).toMatchObject({ attendance: 'ATTENDED', workoutSessionId: doc.id });

    // Progression advanced exactly as if Maria had logged it.
    const after = (await maria.api.gym.bootstrap.query({ today: TODAY })).progressions.find(
      (p) => p.exerciseId === firstRow.exerciseId,
    );
    expect(after?.state.lastExposureDate).toBe(TODAY);
    expect(after?.state).not.toEqual(before?.state);

    // One notice.
    const logged = unread(await maria.api.coaching.notices.query(), 'COACHED_WORKOUT_LOGGED');
    expect(logged).toHaveLength(1);
    expect(logged[0]?.workoutSessionId).toBe(doc.id);

    // The trainer can never overwrite a workout Maria logged herself.
    const herOwn = finishedWorkoutFrom(start.workout, new Date(Date.now() - 30 * 60_000));
    await maria.api.gym.session.upsertMany.mutate({ docs: [herOwn] });
    const overwrite = await trainer.api.trainer.coach.sync.mutate({
      clientId: maria.id,
      docs: [{ ...herOwn, clientUpdatedAt: new Date().toISOString(), notes: 'x' }],
    });
    expect(overwrite.results[0]).toMatchObject({ id: herOwn.id, status: 'rejected' });
  });

  it('attendance by hand; the dashboard, badges and client rows count bookings', async () => {
    if (!enabled) return;
    // 7–12 minutes from now on the 5-minute grid: markable (15 minutes early is allowed).
    const at = utcToZoned(new Date(Date.now() + 12 * 60_000), ZONE);
    const soon = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: at.date,
      time: at.time.replace(/\d$/, (d) => String(Math.floor(Number(d) / 5) * 5)),
      timeZone: ZONE,
      durationMin: 30,
      clients: [{ clientId: ion.id }],
    });
    const noShow = await trainer.api.trainer.bookings.markAttendance.mutate({
      bookingId: soon.id,
      clientId: ion.id,
      attendance: 'NO_SHOW',
    });
    expect(noShow.clients[0]?.attendance).toBe('NO_SHOW');
    const undo = await trainer.api.trainer.bookings.markAttendance.mutate({
      bookingId: soon.id,
      clientId: ion.id,
      attendance: 'SCHEDULED',
    });
    expect(undo.clients[0]?.attendance).toBe('SCHEDULED');
    // Too early: a booking days ahead cannot be marked yet.
    const later = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(5),
      time: '12:00',
      timeZone: ZONE,
      durationMin: 30,
      clients: [{ clientId: ion.id }],
    });
    expect(
      (
        await errorOf(
          trainer.api.trainer.bookings.markAttendance.mutate({
            bookingId: later.id,
            clientId: ion.id,
            attendance: 'ATTENDED',
          }),
        )
      ).code,
    ).toBe('BAD_REQUEST');

    const summary = await trainer.api.trainer.dashboard.summary.query({ today: TODAY });
    expect(summary.bookingsThisWeek).not.toBeNull();
    expect(summary.nextBooking).not.toBeNull();
    expect(Array.isArray(summary.todayBookings)).toBe(true);
    expect(Array.isArray(summary.unmarkedAttendance)).toBe(true);
    expect(Array.isArray(summary.sessionsDelivered)).toBe(true);
    const badges = await trainer.api.trainer.badges.query();
    expect(badges.unmarkedAttendance).toBe(summary.unmarkedAttendance?.length);
    const rows = await trainer.api.trainer.clients.list.query({ today: TODAY });
    expect(rows.find((r) => r.clientId === ion.id)?.nextBookingAt).toBeTruthy();

    const tab = await trainer.api.trainer.client.bookings.query({ clientId: ion.id, today: TODAY });
    expect(tab.upcoming.map((b) => b.id)).toEqual(expect.arrayContaining([soon.id, later.id]));
    expect(tab.deliveredThisMonth).toBeGreaterThanOrEqual(0);
  });

  it('authorization: a non-client is NOT_FOUND everywhere; another trainer cannot see the booking', async () => {
    if (!enabled) return;
    const notClient = await errorOf(
      trainer.api.trainer.bookings.create.mutate({
        kind: 'BOOKING',
        date: day(3),
        time: '09:00',
        timeZone: ZONE,
        durationMin: 60,
        clients: [{ clientId: outsider.id }],
      }),
    );
    expect(notClient.code).toBe('NOT_FOUND');
    expect(notClient.message).toBe('This client isn’t available');
    for (const call of [
      trainer.api.trainer.coach.start.mutate({ clientId: outsider.id, today: TODAY }),
      trainer.api.trainer.client.bookings.query({ clientId: outsider.id, today: TODAY }),
    ]) {
      expect((await errorOf(call)).code).toBe('NOT_FOUND');
    }

    const mine = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BLOCK',
      date: day(6),
      time: '12:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [],
    });
    const other = await makeCoachUser({ prefix: 'bk-other-trainer', apiLevel: LEVEL });
    await other.api.trainer.activate.mutate({ displayName: 'Ion Trainer' });
    expect((await errorOf(other.api.trainer.bookings.get.query({ bookingId: mine.id }))).code).toBe(
      'NOT_FOUND',
    );
    expect(
      (await errorOf(other.api.trainer.bookings.cancel.mutate({ bookingId: mine.id }))).code,
    ).toBe('NOT_FOUND');
    // A client cannot read a booking they have no place in.
    expect(
      (await errorOf(outsider.api.coaching.bookings.get.query({ bookingId: mine.id }))).code,
    ).toBe('NOT_FOUND');
    // Trainer tools off → FORBIDDEN TRAINER_TOOLS_OFF.
    const noTools = await makeCoachUser({ prefix: 'bk-notools', apiLevel: LEVEL });
    const off = await errorOf(
      noTools.api.trainer.bookings.range.query({
        from: new Date().toISOString(),
        to: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    expect(off.code).toBe('FORBIDDEN');
    expect(off.data.reason).toBe('TRAINER_TOOLS_OFF');
  });

  it('limits: 7 clients, the past, beyond 365 days, more than 52 weeks, an unknown zone', async () => {
    if (!enabled) return;
    const base = {
      kind: 'BOOKING' as const,
      date: day(3),
      time: '09:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: maria.id }],
    };
    const seven = Array.from({ length: 7 }, () => ({ clientId: maria.id }));
    for (const input of [
      { ...base, clients: seven },
      { ...base, date: day(-2) },
      { ...base, date: day(400) },
      { ...base, repeat: { rule: 'WEEKLY' as const, until: day(3 + 7 * 52) } },
      { ...base, timeZone: 'Mars/Olympus_Mons' },
      { ...base, clients: [] },
      { ...base, kind: 'BLOCK' as const },
    ]) {
      expect((await errorOf(trainer.api.trainer.bookings.create.mutate(input))).code).toBe(
        'BAD_REQUEST',
      );
    }
  });

  it('coaching ends (the client leaves): their future bookings are cancelled; the group keeps the others', async () => {
    if (!enabled) return;
    const leaver = await joinAsClient(trainer, 'Lena');
    const solo = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(8),
      time: '17:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: leaver.id }],
    });
    const group = await trainer.api.trainer.bookings.create.mutate({
      kind: 'BOOKING',
      date: day(8),
      time: '18:00',
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: leaver.id }, { clientId: maria.id }],
    });
    await leaver.api.coaching.leave.mutate({});

    // The trainer loses the former client's booking entirely.
    expect(
      (await errorOf(trainer.api.trainer.bookings.get.query({ bookingId: solo.id }))).code,
    ).toBe('NOT_FOUND');
    const kept = await trainer.api.trainer.bookings.get.query({ bookingId: group.id });
    expect(kept.cancelledAt).toBeNull();
    expect(kept.clients.map((c) => c.clientId)).toEqual([maria.id]);
    // The former client's own copy reads cancelled.
    expect(
      (await leaver.api.coaching.bookings.get.query({ bookingId: solo.id })).cancelledAt,
    ).not.toBeNull();
    expect(await leaver.api.coaching.bookings.upcoming.query()).toEqual([]);
  });

  it('consent v2: a new join has nothing to acknowledge; acknowledge is idempotent', async () => {
    if (!enabled) return;
    const status = await maria.api.coaching.status.query();
    expect(status.consentUpdate).toBeNull();
    expect(await maria.api.coaching.acknowledgeConsentUpdate.mutate()).toEqual({ ok: true });
    expect(await maria.api.coaching.acknowledgeConsentUpdate.mutate()).toEqual({ ok: true });
    expect((await maria.api.coaching.status.query()).consentUpdate).toBeNull();
  });

  it('a client-sent id never sets who logged it', async () => {
    if (!enabled) return;
    const start = await trainer.api.trainer.coach.start.mutate({ clientId: ion.id, today: TODAY });
    if (!start.workout) throw new Error('fixture: Ion has no routine');
    const doc = finishedWorkoutFrom(start.workout, new Date(Date.now() - 2 * 60 * 60_000));
    await trainer.api.trainer.coach.sync.mutate({
      clientId: ion.id,
      // Unknown keys are stripped by the input schema.
      docs: [{ ...doc, loggedById: ion.id, id: randomUUID() } as typeof doc],
    });
    const history = await ion.api.gym.session.list.query({ limit: 5 });
    expect(history.items[0]?.loggedBy).toEqual({ name: 'Ana' });
  });
});
