'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

/** `navigator.onLine`, live. Creating and changing bookings needs a connection (§12). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Everything a booking change can move: the calendar, Today, the client's tab, badges, next-booking lines. */
export function useInvalidateBookings() {
  const utils = trpc.useUtils();
  return () => {
    void utils.trainer.bookings.invalidate();
    void utils.trainer.dashboard.summary.invalidate();
    void utils.trainer.client.bookings.invalidate();
    void utils.trainer.badges.invalidate();
    void utils.trainer.clients.list.invalidate();
  };
}

/** A clock that ticks once a minute (Start opens 15 minutes before; the now-line moves). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
