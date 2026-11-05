import { describe, expect, it } from 'vitest';
import { createTranslator } from '@chefer/i18n';
import { newBookingDraft } from '@chefer/utils';
import {
  bookingBlockLabelText,
  bookingDraftErrorTexts,
  bookingWhenText,
  dayLabel,
  minuteToTime,
  slotSelection,
  snapMinute,
} from './schedule-layout';
import { booking, client, TZ } from './test-fixtures';

// The shared layout rules (columns, DST placement, windows) are tested in
// @chefer/utils (coaching/bookings.test.ts); these are the web grid's own.

describe('slot helpers', () => {
  it('a click opens an hour from the slot; a drag picks the duration', () => {
    expect(slotSelection(1085, 1088)).toEqual({ start: 1080, durationMin: 60 });
    expect(slotSelection(1080, 1170)).toEqual({ start: 1080, durationMin: 90 });
    expect(slotSelection(1170, 1080)).toEqual({ start: 1080, durationMin: 90 });
    expect(slotSelection(600, 1200).durationMin).toBe(240);
  });

  it('snaps and formats', () => {
    expect(snapMinute(1088)).toBe(1095);
    expect(snapMinute(-20)).toBe(0);
    expect(minuteToTime(1085)).toBe('18:05');
  });
});

describe('booking labels in the UI language (Lane J)', () => {
  const ro = createTranslator('ro');
  const en = createTranslator('en');

  it('reads the same as before in English', () => {
    expect(bookingBlockLabelText(en, booking(), TZ)).toBe(
      'Tuesday 18:00 to 19:00, Maria, Lower body A',
    );
  });

  it('writes Romanian words and lowercase Romanian dates', () => {
    expect(bookingBlockLabelText(ro, booking(), TZ)).toBe(
      'marți, 18:00–19:00, Maria, Lower body A',
    );
    expect(dayLabel(ro, '2026-10-20', 'weekday-long')).toBe('marți');
    expect(bookingWhenText(ro, booking().startsAt, TZ, '2026-10-20')).toBe('Azi, 18:00');
    expect(
      bookingBlockLabelText(ro, booking({ kind: 'BLOCK', clients: [], cancelledAt: 'x' }), TZ),
    ).toBe('marți, 18:00–19:00, Blocat, Anulată');
    expect(
      bookingBlockLabelText(ro, booking({ clients: [client(), client({ clientId: 'c2' })] }), TZ),
    ).toContain('Maria + 1');
  });

  it('translates the editor’s reasons', () => {
    const draft = newBookingDraft({ date: '2026-10-20', time: '18:03', clients: [] });
    const errors = bookingDraftErrorTexts(ro, draft);
    expect(errors.clients).toBe('Alege cel puțin un client.');
    expect(errors.time).toBe('Alege o oră de început din 5 în 5 minute.');
  });
});
