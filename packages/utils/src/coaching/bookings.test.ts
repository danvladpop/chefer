import { describe, expect, it } from 'vitest';
import {
  createBookingInputSchema,
  updateBookingInputSchema,
  type ClientBookingDto,
  type TrainerBookingClientDto,
  type TrainerBookingDto,
} from '@chefer/types';
import { zonedToUtc } from './booking-time';
import {
  assignBookingColumns,
  bookingBlockLabel,
  bookingDayTimeRange,
  bookingDraftFrom,
  bookingOverlapWarnings,
  bookingReminderIdentifier,
  bookingSpanOnDay,
  bookingTimeRange,
  bookingWeekRange,
  bookingWhat,
  bookingWhen,
  bookingWho,
  bookingZoneHint,
  canChangeBooking,
  canMarkAttendance,
  canStartBooking,
  clientCardText,
  clientRowNextBooking,
  hasBookingChanges,
  initialScheduleScrollMinute,
  layoutBookingDay,
  maxRepeatUntil,
  newBookingDraft,
  newBookingSlot,
  nextAttendance,
  nextClientCardBooking,
  planClientReminders,
  planTrainerReminders,
  scheduleWeekDates,
  setDraftClientWorkout,
  toCreateBookingInput,
  todaysNextBooking,
  toggleDraftClient,
  toUpdateBookingInput,
  validateBookingDraft,
  type BookingDraft,
} from './bookings';
import { sortClients } from './trainer-mode';

// Trainer mode M3 (docs/prd-2026-10/trainer-mode.md §6.1–§6.9, §7.3): the booking rules web and
// mobile share. Zones are explicit (Europe/Bucharest; DST ends 25 Oct 2026) so no test depends on
// the machine's zone.

const TZ = 'Europe/Bucharest';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function client(over: Partial<TrainerBookingClientDto> = {}): TrainerBookingClientDto {
  return {
    clientId: 'c1',
    name: 'Maria Pop',
    attendance: 'SCHEDULED',
    workout: { kind: 'ROUTINE_DAY', routineDayId: 'd1', name: 'Lower body A' },
    workoutSessionId: null,
    ...over,
  };
}
const ion = client({
  clientId: 'c2',
  name: 'Ion Rus',
  workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
});

/** A booking at a wall-clock time in Bucharest (default Tue 20 Oct 2026 18:00 = 15:00Z). */
function booking(
  over: Partial<TrainerBookingDto> & { date?: string; time?: string } = {},
): TrainerBookingDto {
  const { date = '2026-10-20', time = '18:00', ...rest } = over;
  const durationMin = rest.durationMin ?? 60;
  const startsAt = rest.startsAt ?? zonedToUtc(date, time, TZ).toISOString();
  return {
    id: 'b1',
    kind: 'BOOKING',
    seriesId: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMin * MIN).toISOString(),
    durationMin,
    timeZone: TZ,
    location: 'Gym Fit Center',
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: [client()],
    ...rest,
  };
}

function clientBooking(
  id: string,
  startsAt: string,
  over: Partial<ClientBookingDto> = {},
): ClientBookingDto {
  return {
    id,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + HOUR).toISOString(),
    durationMin: 60,
    timeZone: TZ,
    trainer: { name: 'Ana' },
    location: 'Gym Fit Center',
    note: null,
    workoutName: null,
    otherClients: 0,
    cancelledAt: null,
    cancelReason: null,
    ...over,
  };
}

describe('labels', () => {
  it('names one client, a group, blocked time, and a booking with no client left', () => {
    expect(bookingWho(booking())).toBe('Maria');
    expect(bookingWho(booking({ clients: [client(), ion] }))).toBe('Maria + 1');
    expect(bookingWho(booking({ kind: 'BLOCK', clients: [] }))).toBe('Blocked');
    expect(bookingWho(booking({ clients: [] }))).toBe('Cancelled');
  });

  it('reads the workout name(s); none for next routine day or blocked time', () => {
    expect(bookingWhat(booking())).toBe('Lower body A');
    expect(bookingWhat(booking({ clients: [ion] }))).toBeNull();
    expect(bookingWhat(booking({ clients: [client(), ion] }))).toBe('Lower body A');
    expect(
      bookingWhat(
        booking({
          clients: [
            client(),
            client({
              clientId: 'c3',
              workout: { kind: 'ROUTINE_DAY', routineDayId: 'd2', name: 'Upper' },
            }),
          ],
        }),
      ),
    ).toBe('Lower body A · Upper');
    expect(bookingWhat(booking({ kind: 'BLOCK', clients: [] }))).toBeNull();
  });

  it('builds the full block label (§12), with Cancelled and the zone hint', () => {
    expect(bookingBlockLabel(booking(), TZ)).toBe('Tuesday 18:00 to 19:00, Maria, Lower body A');
    expect(bookingBlockLabel(booking({ cancelledAt: '2026-10-19T10:00:00.000Z' }), TZ)).toBe(
      'Tuesday 18:00 to 19:00, Maria, Lower body A, Cancelled',
    );
    expect(bookingBlockLabel(booking({ timeZone: 'Europe/London' }), TZ)).toBe(
      'Tuesday 18:00 to 19:00, Maria, Lower body A, In Europe/London time',
    );
  });

  it('formats times in the viewer’s zone', () => {
    const b = booking();
    expect(bookingTimeRange(b, TZ)).toBe('18:00–19:00');
    expect(bookingTimeRange(b, 'Europe/London')).toBe('16:00–17:00');
    expect(bookingWhen(b.startsAt, TZ)).toBe('Tue 20 Oct, 18:00');
    expect(bookingDayTimeRange(b, TZ, '2026-10-20')).toBe('Today, 18:00–19:00');
    expect(bookingDayTimeRange(b, TZ, '2026-10-19')).toBe('Tue 20 Oct, 18:00–19:00');
    expect(bookingZoneHint(b, TZ)).toBeNull();
    expect(bookingZoneHint(b, 'Europe/London')).toBe('In Europe/Bucharest time');
  });
});

describe('day layout', () => {
  const item = (id: string, date: string, time: string, min: number) => {
    const startsAt = zonedToUtc(date, time, TZ).toISOString();
    return { id, startsAt, endsAt: new Date(Date.parse(startsAt) + min * MIN).toISOString() };
  };

  it('keeps non-overlapping spans full width; two at the same time go side by side', () => {
    expect(
      assignBookingColumns([
        { start: 600, end: 660 },
        { start: 660, end: 720 },
      ]).map((s) => [s.column, s.columns]),
    ).toEqual([
      [0, 1],
      [0, 1],
    ]);
    const same = assignBookingColumns([
      { start: 1080, end: 1140 },
      { start: 1080, end: 1140 },
    ]);
    expect(same.map((s) => s.column).sort()).toEqual([0, 1]);
    expect(same.every((s) => s.columns === 2)).toBe(true);
  });

  it('reuses a freed column inside a chained cluster; a gap starts a new cluster', () => {
    const out = assignBookingColumns([
      { start: 1080, end: 1140, id: 'a' },
      { start: 1110, end: 1170, id: 'b' },
      { start: 1140, end: 1200, id: 'c' },
      { start: 1260, end: 1290, id: 'd' },
    ]);
    const byId = new Map(out.map((s) => [s.id, s]));
    expect(byId.get('a')).toMatchObject({ column: 0, columns: 2 });
    expect(byId.get('b')).toMatchObject({ column: 1, columns: 2 });
    expect(byId.get('c')).toMatchObject({ column: 0, columns: 2 });
    expect(byId.get('d')).toMatchObject({ column: 0, columns: 1 });
  });

  it('judges overlap on the drawn length, so a short block never covers the next one', () => {
    const out = assignBookingColumns(
      [
        { start: 600, end: 615 },
        { start: 620, end: 680 },
      ],
      30,
    );
    expect(out.map((s) => s.columns)).toEqual([2, 2]);
  });

  it('places a booking by its wall-clock minute; a DST week keeps 18:00 at 18:00', () => {
    expect(bookingSpanOnDay(item('a', '2026-10-20', '18:00', 60), '2026-10-20', TZ)).toEqual({
      start: 1080,
      end: 1140,
    });
    expect(bookingSpanOnDay(item('a', '2026-10-20', '18:00', 60), '2026-10-21', TZ)).toBeNull();
    const sat = item('sat', '2026-10-24', '18:00', 60);
    const sun = item('sun', '2026-10-25', '18:00', 60);
    expect(sat.startsAt).toBe('2026-10-24T15:00:00.000Z');
    expect(sun.startsAt).toBe('2026-10-25T16:00:00.000Z');
    expect(layoutBookingDay([sat, sun], '2026-10-24', TZ)).toMatchObject([
      { start: 1080, end: 1140, item: { id: 'sat' } },
    ]);
    expect(layoutBookingDay([sat, sun], '2026-10-25', TZ)).toMatchObject([
      { start: 1080, end: 1140, item: { id: 'sun' } },
    ]);
  });

  it('clips a booking across midnight to each day', () => {
    const late = item('late', '2026-10-20', '23:30', 90);
    expect(bookingSpanOnDay(late, '2026-10-20', TZ)).toEqual({ start: 1410, end: 1440 });
    expect(bookingSpanOnDay(late, '2026-10-21', TZ)).toEqual({ start: 0, end: 60 });
  });

  it('cancelled bookings and blocked time still show, side by side with live ones', () => {
    const blocks = layoutBookingDay(
      [
        booking({ id: 'a' }),
        booking({ id: 'b', clients: [ion] }),
        booking({ id: 'x', cancelledAt: '2026-10-19T09:00:00.000Z' }),
        booking({ id: 'blk', kind: 'BLOCK', clients: [], time: '09:00' }),
      ],
      '2026-10-20',
      TZ,
    );
    const at18 = blocks.filter((b) => b.start === 1080);
    expect(at18).toHaveLength(3);
    expect(at18.every((b) => b.columns === 3)).toBe(true);
    expect(blocks.find((b) => b.item.id === 'blk')?.start).toBe(9 * 60);
  });

  it('opens an hour before now on today, else at 06:00', () => {
    expect(initialScheduleScrollMinute(false, 900)).toBe(360);
    expect(initialScheduleScrollMinute(true, 900)).toBe(840);
    expect(initialScheduleScrollMinute(true, 30)).toBe(0);
  });

  it('one range per week, local midnight to local midnight, across the DST change', () => {
    expect(scheduleWeekDates('2026-10-19')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(bookingWeekRange('2026-10-19', TZ)).toEqual({
      from: '2026-10-18T21:00:00.000Z',
      to: '2026-10-25T22:00:00.000Z',
    });
  });
});

describe('windows (the API’s rules)', () => {
  const b = booking();
  const start = Date.parse(b.startsAt);
  const at = (ms: number) => new Date(start + ms);

  it('Start opens 15 minutes before and has no end', () => {
    expect(canStartBooking(b, at(-16 * MIN))).toBe(false);
    expect(canStartBooking(b, at(-15 * MIN))).toBe(true);
    expect(canStartBooking(b, at(3 * DAY))).toBe(true);
  });

  it('Start: never for blocked time, a cancelled booking or one with no client left', () => {
    expect(canStartBooking(booking({ kind: 'BLOCK', clients: [] }), at(0))).toBe(false);
    expect(canStartBooking(booking({ cancelledAt: b.startsAt }), at(0))).toBe(false);
    expect(canStartBooking(booking({ clients: [] }), at(0))).toBe(false);
  });

  it('attendance from 15 minutes before; tapping the marked state again clears it', () => {
    expect(canMarkAttendance(b, at(-16 * MIN))).toBe(false);
    expect(canMarkAttendance(b, at(-15 * MIN))).toBe(true);
    expect(canMarkAttendance(b, at(2 * DAY))).toBe(true);
    expect(canMarkAttendance(booking({ cancelledAt: b.startsAt }), at(0))).toBe(false);
    expect(nextAttendance('SCHEDULED', 'ATTENDED')).toBe('ATTENDED');
    expect(nextAttendance('ATTENDED', 'ATTENDED')).toBe('SCHEDULED');
    expect(nextAttendance('ATTENDED', 'NO_SHOW')).toBe('NO_SHOW');
  });

  it('edit, move and cancel only before the start', () => {
    expect(canChangeBooking(b, at(-MIN))).toBe(true);
    expect(canChangeBooking(b, at(0))).toBe(false);
    expect(canChangeBooking(booking({ cancelledAt: b.startsAt }), at(-HOUR))).toBe(false);
  });

  it('Today’s card shows only today’s next booking; a later one becomes the link', () => {
    expect(todaysNextBooking(b, TZ, '2026-10-20')).toEqual({ today: b, later: null });
    expect(todaysNextBooking(b, TZ, '2026-10-19')).toEqual({ today: null, later: b });
    expect(todaysNextBooking(null, TZ, '2026-10-19')).toEqual({ today: null, later: null });
  });
});

describe('the editor draft', () => {
  const base = (over: Partial<BookingDraft> = {}): BookingDraft => ({
    ...newBookingDraft({
      date: '2026-10-20',
      time: '18:00',
      clients: [{ clientId: 'c1', name: 'Maria Pop' }],
    }),
    ...over,
  });

  it('a new booking starts at the next full hour today, 18:00 on other days', () => {
    const now = new Date('2026-10-20T14:20:00.000Z'); // 17:20 in Bucharest
    expect(newBookingSlot(null, now, TZ)).toEqual({ date: '2026-10-20', time: '18:00' });
    expect(newBookingSlot('2026-10-20', now, TZ)).toEqual({ date: '2026-10-20', time: '18:00' });
    expect(newBookingSlot('2026-10-20', new Date('2026-10-20T06:05:00.000Z'), TZ)).toEqual({
      date: '2026-10-20',
      time: '10:00',
    });
    expect(newBookingSlot('2026-10-22', now, TZ)).toEqual({ date: '2026-10-22', time: '18:00' });
    // 23:30 → tomorrow 00:00, never a time already past.
    expect(newBookingSlot(null, new Date('2026-10-20T20:30:00.000Z'), TZ)).toEqual({
      date: '2026-10-21',
      time: '00:00',
    });
  });

  it('create: next routine day omits the workout, texts trimmed or null, blocked time no clients', () => {
    const input = toCreateBookingInput(base(), TZ);
    expect(input).toEqual({
      kind: 'BOOKING',
      date: '2026-10-20',
      time: '18:00',
      timeZone: TZ,
      durationMin: 60,
      clients: [{ clientId: 'c1' }],
      location: null,
      note: null,
      repeat: null,
    });
    expect(createBookingInputSchema.safeParse(input).success).toBe(true);
    const block = toCreateBookingInput(base({ kind: 'BLOCK', location: '  Gym  ' }), TZ);
    expect(block.clients).toEqual([]);
    expect(block.location).toBe('Gym');
    expect(createBookingInputSchema.safeParse(block).success).toBe(true);
  });

  it('create: a weekly repeat with per-client workouts, until a date or the default', () => {
    let draft = toggleDraftClient(base({ repeat: 'WEEKLY' }), { clientId: 'c2', name: 'Ion' });
    draft = setDraftClientWorkout(draft, 'c1', { kind: 'ROUTINE_DAY', routineDayId: 'd2' });
    draft = setDraftClientWorkout(draft, 'c2', { kind: 'TEMPLATE', templateId: 't1' });
    const input = toCreateBookingInput(draft, TZ);
    expect(input.repeat).toEqual({ rule: 'WEEKLY' });
    expect(input.clients).toEqual([
      { clientId: 'c1', workout: { kind: 'ROUTINE_DAY', routineDayId: 'd2' } },
      { clientId: 'c2', workout: { kind: 'TEMPLATE', templateId: 't1' } },
    ]);
    expect(toCreateBookingInput({ ...draft, until: '2026-12-01' }, TZ).repeat).toEqual({
      rule: 'WEEKLY',
      until: '2026-12-01',
    });
    expect(createBookingInputSchema.safeParse(input).success).toBe(true);
  });

  it('toggles clients, never more than 6', () => {
    let draft = base({ clients: [] });
    for (let i = 0; i < 7; i += 1)
      draft = toggleDraftClient(draft, { clientId: `c${i}`, name: '' });
    expect(draft.clients).toHaveLength(6);
    expect(toggleDraftClient(draft, { clientId: 'c0', name: '' }).clients).toHaveLength(5);
  });

  it('validation: a client for a booking, 15–240 minutes, 5-minute steps, up to 52 weeks', () => {
    expect(validateBookingDraft(base({ clients: [] })).clients).toBe('Pick at least one client.');
    expect(validateBookingDraft(base({ kind: 'BLOCK', clients: [] }))).toEqual({});
    const seven = Array.from({ length: 7 }, (_, i) => ({
      clientId: `c${i}`,
      name: `C${i}`,
      workout: { kind: 'NEXT_DAY' as const },
    }));
    expect(validateBookingDraft(base({ clients: seven })).clients).toBe('Up to 6 clients');
    expect(validateBookingDraft(base({ durationMin: 10 })).duration).toBe(
      'Between 15 and 240 minutes.',
    );
    expect(validateBookingDraft(base({ durationMin: 241 })).duration).toBeDefined();
    expect(validateBookingDraft(base({ time: '18:03' })).time).toBe(
      'Pick a start time in 5-minute steps.',
    );
    expect(validateBookingDraft(base({ date: '' })).date).toBe('Pick a date.');
    expect(maxRepeatUntil('2026-10-20')).toBe('2027-10-12');
    expect(
      validateBookingDraft(base({ repeat: 'WEEKLY', until: '2027-10-12' })).until,
    ).toBeUndefined();
    expect(validateBookingDraft(base({ repeat: 'WEEKLY', until: '2027-10-19' })).until).toBe(
      'At most 52 weeks.',
    );
    expect(validateBookingDraft(base({ repeat: 'WEEKLY', until: '2026-10-19' })).until).toBe(
      'Pick a date after the first booking.',
    );
    expect(validateBookingDraft(base({ note: 'x'.repeat(201) })).note).toBe(
      'Up to 200 characters.',
    );
  });

  it('update: only what changed; a move takes the device zone, other edits keep the booking’s', () => {
    const made = booking({ seriesId: 's1' });
    const original = bookingDraftFrom(made, TZ);
    expect(original).toMatchObject({ date: '2026-10-20', time: '18:00', repeat: 'WEEKLY' });
    const none = toUpdateBookingInput(made, original, original, 'FOLLOWING', TZ);
    expect(none).toEqual({ bookingId: 'b1', expectedVersion: 1, scope: 'FOLLOWING', patch: {} });
    expect(hasBookingChanges(none)).toBe(false);
    const note = toUpdateBookingInput(made, original, { ...original, note: 'Hi' }, 'THIS', TZ);
    expect(note.patch).toEqual({ note: 'Hi' });
    const moved = toUpdateBookingInput(made, original, { ...original, time: '19:00' }, 'THIS', TZ);
    expect(moved.patch).toEqual({ date: '2026-10-20', time: '19:00', timeZone: TZ });
    expect(updateBookingInputSchema.safeParse(moved).success).toBe(true);
    // A one-off booking ignores the scope.
    expect(toUpdateBookingInput(booking(), original, original, 'FOLLOWING', TZ).scope).toBe('THIS');
  });

  it('update: the whole client list when a client or workout changes (order does not matter)', () => {
    const original = bookingDraftFrom(booking({ clients: [client(), ion] }), TZ);
    const reordered = { ...original, clients: [...original.clients].reverse() };
    expect(toUpdateBookingInput(booking(), original, reordered, 'THIS', TZ).patch).toEqual({});
    const added = toggleDraftClient(original, { clientId: 'c3', name: 'Dan' });
    expect(toUpdateBookingInput(booking(), original, added, 'THIS', TZ).patch.clients).toEqual([
      { clientId: 'c1', workout: { kind: 'ROUTINE_DAY', routineDayId: 'd1' } },
      { clientId: 'c2' },
      { clientId: 'c3' },
    ]);
  });

  it('overlap warnings: live overlaps soonest first, never cancelled ones or the edited booking', () => {
    const others = [
      booking({ id: 'a', time: '18:30' }),
      booking({ id: 'blk', kind: 'BLOCK', clients: [], time: '17:00', durationMin: 90 }),
      booking({ id: 'gone', time: '18:00', cancelledAt: '2026-10-19T00:00:00.000Z' }),
      booking({ id: 'later', time: '20:00' }),
      booking({
        id: 'group',
        time: '18:45',
        durationMin: 30,
        clients: [client({ name: 'Ana B' }), client({ clientId: 'c3', name: 'Dan C' })],
      }),
    ];
    expect(
      bookingOverlapWarnings({ date: '2026-10-20', time: '18:00', durationMin: 60 }, others, TZ),
    ).toEqual([
      'Overlaps with 17:00 Blocked',
      'Overlaps with 18:30 Maria',
      'Overlaps with 18:45 Ana + 1',
    ]);
    expect(
      bookingOverlapWarnings(
        { date: '2026-10-20', time: '20:00', durationMin: 30 },
        others,
        TZ,
        'later',
      ),
    ).toEqual([]);
    // Back to back is not an overlap.
    expect(
      bookingOverlapWarnings({ date: '2026-10-20', time: '21:00', durationMin: 30 }, others, TZ),
    ).toEqual([]);
  });
});

describe('Clients tab', () => {
  it('"Next booking: Today, 18:00" / "Next booking: Tue 20 Oct, 18:00"', () => {
    const row = { nextBookingAt: '2026-10-20T15:00:00.000Z' };
    expect(clientRowNextBooking(row, TZ, '2026-10-20')).toBe('Next booking: Today, 18:00');
    expect(clientRowNextBooking(row, TZ, '2026-10-19')).toBe('Next booking: Tue 20 Oct, 18:00');
    expect(clientRowNextBooking({ nextBookingAt: null }, TZ, '2026-10-19')).toBeNull();
  });

  it('sorts by next booking, soonest first; clients with none last, by name', () => {
    const rows = [
      { name: 'Zed', lastWorkoutDate: null, nextBookingAt: null },
      { name: 'Bea', lastWorkoutDate: null, nextBookingAt: '2026-10-22T15:00:00.000Z' },
      { name: 'Ann', lastWorkoutDate: null, nextBookingAt: '2026-10-21T15:00:00.000Z' },
      { name: 'Abe', lastWorkoutDate: null },
    ];
    expect(sortClients(rows, 'nextBooking').map((r) => r.name)).toEqual([
      'Ann',
      'Bea',
      'Abe',
      'Zed',
    ]);
  });
});

describe('the client’s card (§6.9)', () => {
  const NOW = new Date('2026-10-19T09:00:00.000Z');

  it('the next live booking within 7 days; one in progress still shows', () => {
    const list = [
      clientBooking('later', '2026-10-22T15:00:00.000Z'),
      clientBooking('soon', '2026-10-20T15:00:00.000Z'),
      clientBooking('gone', '2026-10-19T15:00:00.000Z', {
        cancelledAt: '2026-10-18T10:00:00.000Z',
      }),
    ];
    expect(nextClientCardBooking(list, NOW)?.id).toBe('soon');
    expect(
      nextClientCardBooking([clientBooking('far', '2026-10-26T10:00:00.000Z')], NOW),
    ).toBeNull();
    expect(
      nextClientCardBooking([clientBooking('done', '2026-10-19T07:00:00.000Z')], NOW),
    ).toBeNull();
    expect(nextClientCardBooking([clientBooking('now', '2026-10-19T08:30:00.000Z')], NOW)?.id).toBe(
      'now',
    );
  });

  it('"Session with Ana · Tue 18:00 · Gym Fit Center · with 1 other", never names', () => {
    const b = clientBooking('x', '2026-10-20T15:00:00.000Z');
    expect(clientCardText(b, TZ, '2026-10-19')).toBe(
      'Session with Ana · Tue 18:00 · Gym Fit Center',
    );
    expect(clientCardText(b, TZ, '2026-10-20')).toBe(
      'Session with Ana · Today 18:00 · Gym Fit Center',
    );
    expect(clientCardText({ ...b, otherClients: 1, location: null }, TZ, '2026-10-19')).toBe(
      'Session with Ana · Tue 18:00 · with 1 other',
    );
    expect(clientCardText({ ...b, otherClients: 2 }, TZ, '2026-10-19')).toContain('with 2 others');
  });
});

describe('reminder plan (§7.3)', () => {
  const NOW = new Date('2026-10-20T08:00:00.000Z');
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

  it('client: 60 minutes before each live booking in the next 14 days, keyed by booking id', () => {
    const plan = planClientReminders(
      [
        clientBooking('soon', at(3 * HOUR)),
        clientBooking('too-close', at(30 * MIN)),
        clientBooking('cancelled', at(5 * HOUR), { cancelledAt: at(-HOUR) }),
        clientBooking('day13', at(13 * DAY)),
        clientBooking('day15', at(15 * DAY)),
      ],
      NOW,
    );
    expect(plan.map((p) => p.bookingId)).toEqual(['soon', 'day13']);
    expect(plan[0]).toEqual({
      identifier: bookingReminderIdentifier('client', 'soon'),
      bookingId: 'soon',
      role: 'client',
      at: new Date(NOW.getTime() + 2 * HOUR),
      body: 'Session with Ana in 1 hour',
    });
    expect(bookingReminderIdentifier('client', 'soon')).toBe('booking-reminder:client:soon');
  });

  it('trainer: their bookings (not blocked or cancelled time), "18:00 Maria · Lower body A"', () => {
    const plan = planTrainerReminders(
      [
        booking({ id: 'b1' }),
        booking({ id: 'group', clients: [client(), ion], date: '2026-10-21' }),
        booking({ id: 'blk', kind: 'BLOCK', clients: [] }),
        booking({ id: 'gone', cancelledAt: at(-HOUR) }),
      ],
      NOW,
      TZ,
    );
    expect(plan.map((p) => [p.bookingId, p.body])).toEqual([
      ['b1', '18:00 Maria · Lower body A'],
      ['group', '18:00 Maria + 1 · Lower body A'],
    ]);
    expect(plan[0]?.at).toEqual(new Date('2026-10-20T14:00:00.000Z'));
  });
});
