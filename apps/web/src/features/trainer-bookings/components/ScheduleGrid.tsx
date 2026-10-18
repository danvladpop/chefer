'use client';

import { useEffect, useRef, useState } from 'react';
import { BOOKING_COPY, type TrainerBookingDto } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import {
  bookingBlockLabel,
  bookingTimeRange,
  bookingWhat,
  bookingWho,
  bookingZoneHint,
  canChangeBooking,
  cn,
  DAY_MINUTES,
  formatDayWithWeekday,
  initialScheduleScrollMinute,
  layoutBookingDay,
  utcToZoned,
} from '@chefer/utils';
import { minuteToTime, slotSelection, snapMinute } from '../lib/schedule-layout';

// ─── The calendar grid (trainer-mode.md §6.2) ─────────────────────────────────
// 24 hours tall, scrolled to now (today) or 06:00, 06:00–22:00 fitting the
// viewport on a laptop. Blocks sit at their wall-clock minute in the device
// zone; overlapping ones go side by side. Click (or drag) an empty slot to
// book it; drag a booking (mouse/pen) to move it. Every block is a button with
// the full label (§12), so the keyboard path is the block → detail → Edit.

export const HOUR_PX = 64;
export const PX_PER_MIN = HOUR_PX / 60;
/** A block is never shorter than a 44 px target. */
const MIN_BLOCK_MIN = Math.ceil(44 / PX_PER_MIN);
const DRAG_THRESHOLD_PX = 6;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Drag {
  booking: TrainerBookingDto;
  pointerId: number;
  x: number;
  y: number;
  /** Minutes between the block's top and the grab point. */
  grab: number;
  moving: boolean;
  target: { date: string; minute: number } | null;
}

interface Selecting {
  date: string;
  pointerId: number;
  from: number;
  to: number;
}

function minuteIn(column: Element, clientY: number): number {
  const rect = column.getBoundingClientRect();
  return Math.max(0, Math.min(DAY_MINUTES, (clientY - rect.top) / PX_PER_MIN));
}

function columnAt(x: number, y: number): HTMLElement | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const col = (el as HTMLElement).closest<HTMLElement>('[data-schedule-date]');
    if (col) return col;
  }
  return null;
}

function Block({
  booking,
  timeZone,
  style,
  dragging,
  onOpen,
  onDragStart,
}: {
  booking: TrainerBookingDto;
  timeZone: string;
  style: React.CSSProperties;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const blocked = booking.kind === 'BLOCK';
  const cancelled = booking.cancelledAt !== null;
  const what = bookingWhat(booking);
  const zone = bookingZoneHint(booking, timeZone);
  return (
    <button
      type="button"
      aria-label={bookingBlockLabel(booking, timeZone)}
      onClick={onOpen}
      onPointerDown={onDragStart}
      style={style}
      data-testid="schedule-block"
      data-booking-id={booking.id}
      className={cn(
        'absolute flex min-w-0 flex-col overflow-hidden rounded-lg border px-1.5 py-1 text-left text-xs leading-tight shadow-e1',
        'focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900',
        blocked
          ? 'border-gray-300 bg-[repeating-linear-gradient(135deg,theme(colors.gray.100)_0_6px,theme(colors.gray.200)_6px_12px)] text-gray-700'
          : 'border-[#f2c9a1] bg-[#fff3e8] text-[#5c2e00]',
        cancelled && 'border-gray-200 bg-gray-50 text-gray-500 opacity-70',
        dragging && 'opacity-40',
        // MO-01 press feedback.
        pressControl,
      )}
    >
      <span className={cn('truncate font-semibold', cancelled && 'line-through')}>
        {bookingWho(booking)}
      </span>
      <span className={cn('truncate', cancelled && 'line-through')}>
        {bookingTimeRange(booking, timeZone)}
      </span>
      {what && <span className="truncate">{what}</span>}
      {cancelled && <span className="truncate font-medium">{BOOKING_COPY.schedule.cancelled}</span>}
      {zone && <span className="truncate italic">{zone}</span>}
    </button>
  );
}

export function ScheduleGrid({
  dates,
  bookings,
  timeZone,
  today,
  nowMinute,
  scrollKey,
  onCreate,
  onOpen,
  onMove,
  onPickDay,
}: {
  dates: string[];
  bookings: readonly TrainerBookingDto[];
  timeZone: string;
  today: string;
  nowMinute: number;
  /** Changes when the view or the week changes: the grid scrolls back to now / 06:00. */
  scrollKey: string;
  onCreate: (slot: { date: string; time: string; durationMin: number }) => void;
  onOpen: (booking: TrainerBookingDto) => void;
  onMove: (booking: TrainerBookingDto, date: string, time: string) => void;
  /** Week view: a day header opens that day. */
  onPickDay?: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selecting, setSelecting] = useState<Selecting | null>(null);
  const suppressClick = useRef(false);
  const week = dates.length > 1;
  const showsToday = dates.includes(today);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = initialScheduleScrollMinute(showsToday, nowMinute) * PX_PER_MIN;
    // Only when the view or the week changes, never on a refetch or a clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  // ── Empty slot: click, or drag down to choose the duration ────────────────
  const onColumnPointerDown = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const minute = minuteIn(e.currentTarget, e.clientY);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelecting({ date, pointerId: e.pointerId, from: minute, to: minute });
  };
  const onColumnPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selecting?.pointerId !== e.pointerId) return;
    setSelecting({ ...selecting, to: minuteIn(e.currentTarget, e.clientY) });
  };
  const onColumnPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selecting?.pointerId !== e.pointerId) return;
    const slot = slotSelection(selecting.from, minuteIn(e.currentTarget, e.clientY));
    setSelecting(null);
    onCreate({
      date: selecting.date,
      time: minuteToTime(slot.start),
      durationMin: slot.durationMin,
    });
  };

  // ── Move a booking (web only, mouse or pen) ───────────────────────────────
  const startDrag =
    (booking: TrainerBookingDto, blockTop: number) =>
    (e: React.PointerEvent<HTMLButtonElement>) => {
      suppressClick.current = false;
      // Started or cancelled bookings stay put (the API refuses to move them).
      if (e.button !== 0 || e.pointerType === 'touch' || !canChangeBooking(booking, new Date()))
        return;
      const column = e.currentTarget.closest('[data-schedule-date]');
      if (!column) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({
        booking,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        grab: minuteIn(column, e.clientY) - blockTop,
        moving: false,
        target: null,
      });
    };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const moving =
        drag.moving || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_THRESHOLD_PX;
      if (!moving) return;
      const column = columnAt(e.clientX, e.clientY);
      const date = column?.dataset['scheduleDate'];
      setDrag(
        (d) =>
          d && {
            ...d,
            moving: true,
            target:
              column && date
                ? { date, minute: snapMinute(minuteIn(column, e.clientY) - d.grab) }
                : d.target,
          },
      );
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      setDrag(null);
      if (!drag.moving) return;
      suppressClick.current = true;
      const t = drag.target;
      if (!t) return;
      const time = minuteToTime(t.minute);
      const was = utcToZoned(drag.booking.startsAt, timeZone);
      if (t.date !== was.date || time !== was.time) onMove(drag.booking, t.date, time);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag, onMove, timeZone]);

  const columns = `3rem repeat(${dates.length}, minmax(${week ? '5.5rem' : '0'}, 1fr))`;

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div
        ref={scroller}
        className="relative max-h-[min(64rem,calc(100dvh-16rem))] min-h-80 overflow-auto overscroll-contain"
        data-testid="schedule-scroller"
      >
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          {/* Header row (sticky) */}
          <div className="sticky left-0 top-0 z-20 border-b bg-white" aria-hidden="true" />
          {dates.map((date) => {
            const label = formatDayWithWeekday(date);
            const isToday = date === today;
            const cls = cn(
              'flex min-h-11 w-full items-center justify-center border-b border-l px-1 text-xs font-semibold',
              isToday ? 'text-[#944a00]' : 'text-gray-700',
            );
            return (
              <div key={date} className="sticky top-0 z-10 bg-white">
                {onPickDay ? (
                  <button
                    type="button"
                    onClick={() => onPickDay(date)}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(cls, 'hover:bg-gray-50', pressControl)}
                  >
                    {label}
                  </button>
                ) : (
                  <div className={cls} aria-current={isToday ? 'date' : undefined}>
                    {label}
                  </div>
                )}
              </div>
            );
          })}

          {/* Hour gutter */}
          <div className="sticky left-0 z-10 bg-white" aria-hidden="true">
            {HOURS.map((h) => (
              <div
                key={h}
                className="relative border-r text-right text-xs text-gray-500"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-2 right-1 bg-white px-0.5">
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dates.map((date) => {
            const placed = layoutBookingDay(bookings, date, timeZone, MIN_BLOCK_MIN);
            const sel = selecting?.date === date ? selecting : null;
            const ghost = drag?.moving && drag.target?.date === date ? drag : null;
            return (
              <div
                key={date}
                data-schedule-date={date}
                data-testid="schedule-day"
                onPointerDown={onColumnPointerDown(date)}
                onPointerMove={onColumnPointerMove}
                onPointerUp={onColumnPointerUp}
                onPointerCancel={() => setSelecting(null)}
                className="relative cursor-cell touch-pan-y border-l bg-[linear-gradient(to_bottom,theme(colors.gray.100)_1px,transparent_1px)] bg-[length:100%_64px]"
                style={{ height: 24 * HOUR_PX }}
              >
                {date === today && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500"
                    style={{ top: nowMinute * PX_PER_MIN }}
                  />
                )}
                {placed.map((p) => {
                  const height = Math.max(p.end - p.start, MIN_BLOCK_MIN) * PX_PER_MIN;
                  return (
                    <Block
                      key={p.item.id}
                      booking={p.item}
                      timeZone={timeZone}
                      dragging={drag?.moving === true && drag.booking.id === p.item.id}
                      style={{
                        top: p.start * PX_PER_MIN,
                        height,
                        left: `calc(${(p.column / p.columns) * 100}% + 2px)`,
                        width: `calc(${100 / p.columns}% - 4px)`,
                      }}
                      onOpen={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        onOpen(p.item);
                      }}
                      onDragStart={startDrag(p.item, p.start)}
                    />
                  );
                })}
                {sel && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0.5 rounded-lg border-2 border-dashed border-[#944a00] bg-[#fff3e8]/60"
                    style={{
                      top: Math.floor(Math.min(sel.from, sel.to) / 15) * 15 * PX_PER_MIN,
                      height:
                        Math.max(
                          15,
                          Math.ceil(Math.max(sel.from, sel.to) / 15) * 15 -
                            Math.floor(Math.min(sel.from, sel.to) / 15) * 15,
                        ) * PX_PER_MIN,
                    }}
                  />
                )}
                {ghost?.target && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0.5 z-20 rounded-lg border-2 border-dashed border-gray-900 bg-white/70 px-1.5 py-1 text-xs font-semibold text-gray-900"
                    style={{
                      top: ghost.target.minute * PX_PER_MIN,
                      height: Math.max(ghost.booking.durationMin, MIN_BLOCK_MIN) * PX_PER_MIN,
                    }}
                  >
                    {minuteToTime(ghost.target.minute)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
