import type { Translator } from '@chefer/i18n';
import {
  BOOKING_COPY,
  BOOKING_DURATION_LIMITS,
  localTimeSchema,
  TRAINER_MODE_LIMITS,
  type ClientBookingDto,
  type ClientRowDto,
  type TrainerBookingDto,
} from '@chefer/types';
import {
  bookingTime,
  bookingTimeRange,
  bookingWhat,
  DAY_MINUTES,
  intervalsOverlap,
  utcToZoned,
  validateBookingDraft,
  zonedToUtc,
  type BookingDraft,
  type BookingDraftErrors,
  type DateStyle,
} from '@chefer/utils';

// ─── Schedule grid interactions on the web (trainer-mode.md §6.2) ─────────────
// Mouse/pen-only helpers: a click or drag on an empty slot and a drag of a
// block snap to the grid. Where blocks sit and how overlaps share a column are
// the shared rules in @chefer/utils (`layoutBookingDay`).

/** Snap a minute to a step (default 15), clamped to the day. */
export function snapMinute(minute: number, step = 15): number {
  const snapped = Math.round(minute / step) * step;
  return Math.max(0, Math.min(DAY_MINUTES - step, snapped));
}

/** A click (or a drag from `a` to `b`) on an empty slot → the editor's start and duration. */
export function slotSelection(
  a: number,
  b: number,
  options: { step?: number; defaultDuration?: number; min?: number; max?: number } = {},
): { start: number; durationMin: number } {
  const step = options.step ?? 15;
  const min = options.min ?? 15;
  const max = options.max ?? 240;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.floor(lo / step) * step;
  if (hi - lo < step) return { start, durationMin: options.defaultDuration ?? 60 };
  const end = Math.ceil(hi / step) * step;
  return { start, durationMin: Math.max(min, Math.min(max, end - start, DAY_MINUTES - start)) };
}

/** "18:05" for a minute of the day. */
export function minuteToTime(minute: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ─── Booking labels in the UI language (Lane J, ADR 0004) ─────────────────────
// The translated twins of @chefer/utils' booking labels (`bookingWho`,
// `bookingWhen`, `bookingBlockLabel`, …), which still write English. Same
// rules, but every word goes through the translator and every date through
// `date()`. Kept identical on web and mobile until they move to a shared home.

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` calendar day ("Wed 30 Sep" / "mie., 30 sept.") read as that
 * day wherever the viewer is, or an ISO instant in the viewer's own zone.
 */
export function dayLabel(
  tr: Translator,
  value: string,
  style: DateStyle = 'weekday-short',
): string {
  return LOCAL_DATE.test(value) ? tr.date(value, style, 'UTC') : tr.date(value, style);
}

/** "Maria" from "Maria Pop" (the whole name when it has no first word). */
function firstWord(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first !== undefined && first !== '' ? first : name;
}

/** Who the slot is with: "Maria", "Maria + 1"; "Blocked" for blocked time. */
export function bookingWhoText(
  tr: Translator,
  booking: Pick<TrainerBookingDto, 'kind' | 'clients'>,
): string {
  if (booking.kind === 'BLOCK') return tr.t('trainer.bookings.schedule.blocked');
  const [first] = booking.clients;
  if (!first) return tr.t('trainer.bookings.schedule.cancelled');
  const others = booking.clients.length - 1;
  const name = firstWord(first.name);
  return others > 0 ? tr.t('trainer.bookings.schedule.groupName', { first: name, others }) : name;
}

/** "Tue 21 Oct, 18:00", or "Today, 18:00" when `today` is that day. */
export function bookingWhenText(
  tr: Translator,
  iso: string,
  zone: string,
  today: string | null = null,
): string {
  const z = utcToZoned(iso, zone);
  const day = z.date === today ? tr.t('trainer.bookings.schedule.today') : dayLabel(tr, z.date);
  return tr.t('trainer.format.dayTime', { day, time: z.time });
}

/** "Today, 18:00–19:00" / "Tue 21 Oct, 18:00–19:00". */
export function bookingDayTimeRangeText(
  tr: Translator,
  booking: Pick<TrainerBookingDto, 'startsAt' | 'endsAt'>,
  zone: string,
  today: string,
): string {
  const date = utcToZoned(booking.startsAt, zone).date;
  const day = date === today ? tr.t('trainer.bookings.schedule.today') : dayLabel(tr, date);
  return tr.t('trainer.format.dayTime', { day, time: bookingTimeRange(booking, zone) });
}

/** "Tuesday 18:00 to 19:00": the spoken "when" of a calendar block. */
export function bookingWhenSpokenText(
  tr: Translator,
  booking: Pick<TrainerBookingDto, 'startsAt' | 'endsAt'>,
  zone: string,
): string {
  const start = utcToZoned(booking.startsAt, zone);
  return tr.t('trainer.bookings.schedule.when', {
    weekday: dayLabel(tr, start.date, 'weekday-long'),
    start: start.time,
    end: bookingTime(booking.endsAt, zone),
  });
}

/** "In Europe/Bucharest time", only for a booking made in another zone than `zone`. */
export function bookingZoneHintText(
  tr: Translator,
  booking: Pick<TrainerBookingDto, 'timeZone'>,
  zone: string,
): string | null {
  return booking.timeZone !== zone
    ? tr.t('trainer.bookings.schedule.otherZone', { zone: booking.timeZone })
    : null;
}

/** A calendar block's accessible name: "Tuesday 18:00 to 19:00, Maria, Lower body A". */
export function bookingBlockLabelText(
  tr: Translator,
  booking: TrainerBookingDto,
  zone: string,
): string {
  const parts: string[] = [bookingWhenSpokenText(tr, booking, zone), bookingWhoText(tr, booking)];
  const what = bookingWhat(booking);
  if (what) parts.push(what);
  if (booking.cancelledAt) parts.push(tr.t('trainer.bookings.schedule.cancelled'));
  const hint = bookingZoneHintText(tr, booking, zone);
  if (hint) parts.push(hint);
  return parts.join(', ');
}

/** "Overlaps with 18:00 Maria" for every live booking the draft's first occurrence overlaps. */
export function bookingOverlapTexts(
  tr: Translator,
  draft: Pick<BookingDraft, 'date' | 'time' | 'durationMin'>,
  bookings: readonly TrainerBookingDto[],
  zone: string,
  excludeId: string | null = null,
): string[] {
  if (!LOCAL_DATE.test(draft.date) || !localTimeSchema.safeParse(draft.time).success) return [];
  const startsAt = zonedToUtc(draft.date, draft.time, zone);
  return bookings
    .filter(
      (b) =>
        b.id !== excludeId &&
        !b.cancelledAt &&
        intervalsOverlap({ startsAt, durationMin: draft.durationMin }, b),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((b) =>
      tr.t('trainer.bookings.editor.overlaps', {
        time: bookingTime(b.startsAt, zone),
        who: bookingWhoText(tr, b),
      }),
    );
}

/** "Next booking: Today, 18:00" on a client row, or null. */
export function clientRowNextBookingText(
  tr: Translator,
  row: Pick<ClientRowDto, 'nextBookingAt'>,
  zone: string,
  today: string,
): string | null {
  return row.nextBookingAt
    ? tr.t('trainer.bookings.today.nextOn', {
        when: bookingWhenText(tr, row.nextBookingAt, zone, today),
      })
    : null;
}

/** "with 1 other" for a group booking, else null. */
export function bookingOthersLabel(
  tr: Translator,
  booking: Pick<ClientBookingDto, 'otherClients'>,
): string | null {
  return booking.otherClients > 0
    ? tr.t('trainer.bookings.client.withOthers', { count: booking.otherClients })
    : null;
}

/** "Today 18:00" / "Tue 18:00": the client card's "when". */
export function clientCardWhenText(
  tr: Translator,
  startsAt: string,
  zone: string,
  today: string,
): string {
  const z = utcToZoned(startsAt, zone);
  const day =
    z.date === today ? tr.t('trainer.bookings.schedule.today') : dayLabel(tr, z.date, 'weekday');
  return tr.t('trainer.format.dayTimeShort', { day, time: z.time });
}

/** "Session with Ana · Tue 18:00 · Gym Fit Center · with 1 other". */
export function clientCardLabel(
  tr: Translator,
  booking: ClientBookingDto,
  zone: string,
  today: string,
): string {
  return [
    tr.t('trainer.bookings.client.card', {
      trainer: booking.trainer.name,
      when: clientCardWhenText(tr, booking.startsAt, zone, today),
    }),
    booking.location,
    bookingOthersLabel(tr, booking),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `validateBookingDraft`'s reasons, in the UI language (same fields, same rules). */
export function bookingDraftErrorTexts(tr: Translator, draft: BookingDraft): BookingDraftErrors {
  const raw = validateBookingDraft(draft);
  const v = BOOKING_COPY.editor.validation;
  const out: BookingDraftErrors = {};
  if (raw.clients !== undefined) {
    out.clients =
      raw.clients === BOOKING_COPY.editor.needsClient
        ? tr.t('trainer.bookings.editor.needsClient')
        : tr.t('trainer.bookings.editor.clientsMax', {
            count: TRAINER_MODE_LIMITS.clientsPerBooking,
          });
  }
  if (raw.date !== undefined) out.date = tr.t('trainer.bookings.editor.validation.date');
  if (raw.time !== undefined) out.time = tr.t('trainer.bookings.editor.validation.time');
  if (raw.duration !== undefined) {
    out.duration = tr.t('trainer.bookings.editor.validation.duration', {
      min: BOOKING_DURATION_LIMITS.min,
      max: BOOKING_DURATION_LIMITS.max,
    });
  }
  if (raw.until !== undefined) {
    out.until =
      raw.until === v.until
        ? tr.t('trainer.bookings.editor.validation.until')
        : tr.t('trainer.bookings.editor.validation.maxWeeks', {
            count: TRAINER_MODE_LIMITS.weeklyRepeats,
          });
  }
  if (raw.location !== undefined) {
    out.location = tr.t('trainer.bookings.editor.validation.maxChars', {
      count: TRAINER_MODE_LIMITS.locationMaxChars,
    });
  }
  if (raw.note !== undefined) {
    out.note = tr.t('trainer.bookings.editor.validation.maxChars', {
      count: TRAINER_MODE_LIMITS.noteMaxChars,
    });
  }
  return out;
}
