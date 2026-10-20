import { describe, expect, it } from 'vitest';
import type { CoachingNoticeDto } from '@chefer/types';
import { clientNoticeView, noticeViews } from './notice-view';

const client = { id: 'c1', name: 'Ada', role: 'CLIENT' as const };
const trainer = { id: 't1', name: 'Ana', role: 'TRAINER' as const };
const notice = (over: Partial<CoachingNoticeDto>): CoachingNoticeDto => ({
  id: 'n1',
  kind: 'ROUTINE_UPDATED',
  at: '2026-10-02T12:00:00.000Z',
  read: false,
  other: client,
  ...over,
});

describe('trainer notices', () => {
  it('a client’s routine edit links to that client’s routine with the changes', () => {
    const [view] = noticeViews(
      [notice({ changes: [{ kind: 'removed', exercise: 'Leg press' }] })],
      'trainer',
    );
    expect(view).toMatchObject({
      text: 'Ada changed their routine',
      detail: '− Leg press',
      href: '/trainer/c1/routine',
    });
  });

  it('a client who left, and a new request pointing at Requests', () => {
    const views = noticeViews(
      [
        notice({ id: 'a', kind: 'COACHING_ENDED', endedBy: 'CLIENT' }),
        notice({ id: 'b', kind: 'REQUEST_RECEIVED' }),
      ],
      'trainer',
    );
    expect(views.map((v) => [v.text, v.href])).toEqual([
      ['Ada left. Their routine stays theirs.', null],
      ['Ada asked you to coach them', '#trainer-requests'],
    ]);
  });

  it('skips the trainer’s own ending, read notices and notices from the viewer’s trainer', () => {
    expect(
      noticeViews(
        [
          notice({ kind: 'COACHING_ENDED', endedBy: 'TRAINER' }),
          notice({ read: true }),
          notice({ other: trainer }),
        ],
        'trainer',
      ),
    ).toEqual([]);
  });
});

describe('client notices', () => {
  it('only reads notices from the viewer’s trainer', () => {
    const views = noticeViews(
      [notice({ id: 'mine', other: trainer }), notice({ id: 'theirs' })],
      'client',
    );
    expect(views.map((v) => v.id)).toEqual(['mine']);
  });

  it('a routine card without a change list has no detail line', () => {
    const [view] = noticeViews([notice({ other: trainer, changes: [] })], 'client');
    expect(view?.detail).toBeNull();
  });
});

describe('booking notices (trainer mode M3, §7.1)', () => {
  const TZ = 'Europe/Bucharest';
  const booking = (over: Partial<NonNullable<CoachingNoticeDto['booking']>> = {}) => ({
    bookingId: 'b1',
    startsAt: '2026-10-21T15:00:00.000Z',
    timeZone: TZ,
    weekly: false,
    reason: null,
    ...over,
  });

  it('created (one-off and weekly), changed and cancelled read with the time and open the booking', () => {
    const at = (n: Partial<CoachingNoticeDto>) =>
      clientNoticeView(notice({ other: trainer, ...n }), TZ);
    expect(at({ kind: 'BOOKING_CREATED', booking: booking() })).toMatchObject({
      text: 'Ana booked you for Wed 21 Oct, 18:00',
      href: '/coaching/bookings/b1',
    });
    expect(at({ kind: 'BOOKING_CREATED', booking: booking({ weekly: true }) })?.text).toBe(
      'Ana booked you for Wed 21 Oct, 18:00, every week',
    );
    expect(at({ kind: 'BOOKING_CHANGED', booking: booking() })?.text).toBe(
      'Ana moved your booking to Wed 21 Oct, 18:00',
    );
    expect(
      at({ kind: 'BOOKING_CANCELLED', booking: booking({ reason: 'I am ill' }) }),
    ).toMatchObject({
      text: 'Ana cancelled your booking on Wed 21 Oct, 18:00',
      detail: 'I am ill',
    });
  });

  it('a coached workout opens that session in history', () => {
    expect(
      clientNoticeView(
        notice({ other: trainer, kind: 'COACHED_WORKOUT_LOGGED', workoutSessionId: 's1' }),
        TZ,
      ),
    ).toMatchObject({ text: 'Ana logged a workout for you', href: '/gym/history/s1' });
  });

  it('never shows on the trainer side', () => {
    const kinds = [
      'BOOKING_CREATED',
      'BOOKING_CHANGED',
      'BOOKING_CANCELLED',
      'COACHED_WORKOUT_LOGGED',
    ] as const;
    expect(
      noticeViews(
        kinds.map((kind, i) => notice({ id: `n${i}`, kind, booking: booking() })),
        'trainer',
      ),
    ).toEqual([]);
  });
});
