// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { scheduleWeekDates } from '@chefer/utils';
import { booking, client, TZ } from '../lib/test-fixtures';
import { HOUR_PX, PX_PER_MIN, ScheduleGrid } from './ScheduleGrid';

afterEach(cleanup);

// jsdom has no PointerEvent: a MouseEvent with the pointer fields is enough here.
beforeAll(() => {
  class FakePointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;
});

function show(
  bookings: ReturnType<typeof booking>[],
  dates = scheduleWeekDates('2026-10-19'),
  extra = {},
) {
  const props = {
    dates,
    bookings,
    timeZone: TZ,
    today: '2026-10-20',
    nowMinute: 600,
    scrollKey: 'k',
    onCreate: vi.fn(),
    onOpen: vi.fn(),
    onMove: vi.fn(),
    ...extra,
  };
  render(<ScheduleGrid {...props} />);
  return props;
}

const blockNamed = (name: RegExp | string) => screen.getByRole('button', { name });

describe('ScheduleGrid', () => {
  it('renders each booking as a button with its full label at its minute of day', () => {
    show([booking()]);
    const block = blockNamed('Tuesday 18:00 to 19:00, Maria, Lower body A');
    expect(block).toHaveStyle({ top: `${18 * HOUR_PX}px`, height: `${HOUR_PX}px` });
    expect(block).toHaveTextContent('Maria');
    expect(block).toHaveTextContent('18:00–19:00');
  });

  it('a DST week renders a weekly 18:00 at 18:00 on both sides of 25 Oct', () => {
    show([
      booking({ id: 'sat', date: '2026-10-24', seriesId: 's1' }),
      booking({ id: 'sun', date: '2026-10-25', seriesId: 's1' }),
    ]);
    expect(blockNamed(/^Saturday 18:00 to 19:00/)).toHaveStyle({ top: `${1080 * PX_PER_MIN}px` });
    expect(blockNamed(/^Sunday 18:00 to 19:00/)).toHaveStyle({ top: `${1080 * PX_PER_MIN}px` });
  });

  it('puts overlapping bookings side by side', () => {
    show([
      booking({ id: 'a' }),
      booking({ id: 'b', clients: [client({ clientId: 'c2', name: 'Ion Pop' })] }),
    ]);
    const a = blockNamed(/Maria/);
    const b = blockNamed(/Ion/);
    expect(a.style.width).toBe('calc(50% - 4px)');
    expect(b.style.width).toBe('calc(50% - 4px)');
    expect(new Set([a.style.left, b.style.left])).toEqual(
      new Set(['calc(0% + 2px)', 'calc(50% + 2px)']),
    );
  });

  it('labels groups, blocked time, cancelled ones and another zone', () => {
    show([
      booking({
        id: 'g',
        time: '08:00',
        clients: [client(), client({ clientId: 'c2', name: 'Ion Pop' })],
      }),
      booking({ id: 'blk', kind: 'BLOCK', clients: [], time: '12:00' }),
      booking({ id: 'x', time: '15:00', cancelledAt: '2026-10-19T08:00:00.000Z' }),
      booking({ id: 'z', time: '20:00', timeZone: 'Europe/London' }),
    ]);
    expect(blockNamed(/^Tuesday 08:00 to 09:00, Maria \+ 1/)).toBeInTheDocument();
    expect(blockNamed('Tuesday 12:00 to 13:00, Blocked')).toHaveClass('text-gray-700');
    expect(blockNamed(/15:00 to 16:00, Maria, Lower body A, Cancelled$/)).toHaveTextContent(
      'Cancelled',
    );
    expect(blockNamed(/In Europe\/London time$/)).toHaveTextContent('In Europe/London time');
  });

  it('opens a booking on click', () => {
    const props = show([booking()]);
    fireEvent.click(blockNamed(/Maria/));
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  });

  it('a day header switches to that day in the week view', () => {
    const onPickDay = vi.fn();
    show([], scheduleWeekDates('2026-10-19'), { onPickDay });
    fireEvent.click(screen.getByRole('button', { name: 'Wed 21 Oct' }));
    expect(onPickDay).toHaveBeenCalledWith('2026-10-21');
  });

  it('a click on an empty slot opens the editor at that time for an hour', () => {
    const props = show([], ['2026-10-20']);
    const day = screen.getByTestId('schedule-day');
    day.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 1536 });
    const y = 18 * HOUR_PX + 5;
    fireEvent.pointerDown(day, { button: 0, pointerId: 1, clientY: y });
    fireEvent.pointerUp(day, { button: 0, pointerId: 1, clientY: y });
    expect(props.onCreate).toHaveBeenCalledWith({
      date: '2026-10-20',
      time: '18:00',
      durationMin: 60,
    });
  });
});
