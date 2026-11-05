import { createTranslator, type Translator } from '@chefer/i18n';
import { BOOKING_COPY, type CoachingNoticeDto } from '@chefer/types';
import { bookingWhen, deviceTimeZone } from '@chefer/utils';
import { routineChangesLineT, trainerNameOrFallbackT } from './copy';
import { formatShortDayT } from './dates';

// ─── Coaching notices → cards (PRD 2026-10 §4.2, §4.3) ────────────────────────
// `coaching.notices` returns both sides' notices in one list. Each side's cards
// read only the notices whose other person plays the opposite role, so someone
// who is a trainer AND a client sees each card on the right screen.

export type NoticeSide = 'client' | 'trainer';

export interface NoticeView {
  id: string;
  /** The card's one line ("Ana updated your routine"). */
  text: string;
  /** The changes line ("+ Romanian deadlift · Squat 3×8 → 4×6"), when there is one. */
  detail: string | null;
  /** Where "View" goes (opening it dismisses the card); null = Dismiss only. */
  href: string | null;
  testId: string;
}

type T = Translator['t'];

// English when no translator is passed (tests, older callers).
const EN = createTranslator('en').t;

function changesDetail(notice: CoachingNoticeDto, t: T): string | null {
  const changes = notice.changes ?? [];
  return changes.length > 0 ? routineChangesLineT(changes, t) : null;
}

/** "Tue 21 Oct, 18:00" for a booking notice, in the viewer's zone. */
function noticeWhen(notice: CoachingNoticeDto, timeZone: string, t: T): string {
  // `bookingWhen` and BOOKING_COPY belong to the bookings screens (namespace `trainer`).
  return notice.booking
    ? bookingWhen(notice.booking.startsAt, timeZone)
    : formatShortDayT(notice.at, t);
}

function bookingHref(notice: CoachingNoticeDto): string | null {
  return notice.booking
    ? `/coaching/bookings/${encodeURIComponent(notice.booking.bookingId)}`
    : null;
}

/** A client's card for a notice from their trainer, or null when it has none. */
export function clientNoticeView(
  notice: CoachingNoticeDto,
  timeZone: string = deviceTimeZone(),
  t: T = EN,
): NoticeView | null {
  if (notice.read || notice.other.role !== 'TRAINER') return null;
  const name = trainerNameOrFallbackT(notice.other.name, t);
  const base = { id: notice.id, detail: null, href: null, testId: 'coaching-notice' };
  const b = BOOKING_COPY.notices;
  switch (notice.kind) {
    // Trainer mode M3 (§7.1): bookings and coached workouts.
    case 'BOOKING_CREATED':
      return {
        ...base,
        text: notice.booking?.weekly
          ? b.createdSeries(name, noticeWhen(notice, timeZone, t))
          : b.created(name, noticeWhen(notice, timeZone, t)),
        href: bookingHref(notice),
        testId: 'coaching-booking-notice',
      };
    case 'BOOKING_CHANGED':
      return {
        ...base,
        text: b.changed(name, noticeWhen(notice, timeZone, t)),
        href: bookingHref(notice),
        testId: 'coaching-booking-notice',
      };
    case 'BOOKING_CANCELLED':
      return {
        ...base,
        text: b.cancelled(name, noticeWhen(notice, timeZone, t)),
        detail: notice.booking?.reason ?? null,
        href: bookingHref(notice),
        testId: 'coaching-booking-notice',
      };
    case 'COACHED_WORKOUT_LOGGED':
      return {
        ...base,
        text: b.coachedWorkout(name),
        href: notice.workoutSessionId
          ? `/gym/history/${encodeURIComponent(notice.workoutSessionId)}`
          : null,
        testId: 'coaching-workout-logged',
      };
    case 'ROUTINE_UPDATED':
      return {
        ...base,
        text: t('coaching.notices.routineUpdated', { name }),
        detail: changesDetail(notice, t),
        href: '/gym/routine',
        testId: 'coaching-routine-updated',
      };
    case 'COACHING_ENDED':
      // The client's own Leave needs no card.
      if (notice.endedBy === 'CLIENT') return null;
      return {
        ...base,
        text:
          notice.endedBy === 'SYSTEM' && notice.other.id === null
            ? t('coaching.notices.trainerGone')
            : t('coaching.notices.endedByTrainer', { trainer: name }),
      };
    case 'REQUEST_ACCEPTED':
      return { ...base, text: t('coaching.notices.requestAccepted', { trainer: name }) };
    case 'REQUEST_DECLINED':
      return { ...base, text: t('coaching.notices.requestDeclined', { trainer: name }) };
    case 'REQUEST_RECEIVED':
      return null;
  }
}

/** A trainer's card for a notice about one of their clients, or null when it has none. */
export function trainerNoticeView(notice: CoachingNoticeDto, t: T = EN): NoticeView | null {
  if (notice.read || notice.other.role !== 'CLIENT') return null;
  const name = notice.other.name;
  const base = { id: notice.id, detail: null, href: null, testId: 'trainer-notice' };
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return {
        ...base,
        text: t('coaching.notices.clientUpdated', { client: name }),
        detail: changesDetail(notice, t),
        href:
          notice.other.id === null
            ? null
            : `/trainer/${encodeURIComponent(notice.other.id)}/routine`,
      };
    case 'COACHING_ENDED':
      // The trainer's own "End coaching" needs no card.
      if (notice.endedBy === 'TRAINER') return null;
      return { ...base, text: t('coaching.notices.endedByClient', { client: name }) };
    case 'REQUEST_RECEIVED':
      return {
        ...base,
        text: t('coaching.notices.requestReceived', { client: name }),
        href: '#trainer-requests',
      };
    // Answers go to the client; the M3 kinds are client-side too (a trainer never gets them).
    case 'REQUEST_ACCEPTED':
    case 'REQUEST_DECLINED':
    case 'BOOKING_CREATED':
    case 'BOOKING_CHANGED':
    case 'BOOKING_CANCELLED':
    case 'COACHED_WORKOUT_LOGGED':
      return null;
  }
}

export function noticeViews(
  notices: readonly CoachingNoticeDto[],
  side: NoticeSide,
  t: T = EN,
): NoticeView[] {
  const view =
    side === 'client'
      ? (n: CoachingNoticeDto) => clientNoticeView(n, deviceTimeZone(), t)
      : (n: CoachingNoticeDto) => trainerNoticeView(n, t);
  return notices.flatMap((n) => {
    const v = view(n);
    return v ? [v] : [];
  });
}
