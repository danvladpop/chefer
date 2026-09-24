import { randomUUID } from 'expo-crypto';

// Client-generated ids and device-local dates for offline docs (gym_plan.md
// §5.2 "Ids" and "Clock"): ids are v4 UUIDs so the server's idempotent upsert
// can key on them; localDate is the DEVICE's calendar day (the server never
// re-buckets by its own timezone); timestamps are ISO UTC.

/** A fresh v4 UUID for sessions, session exercises and sets. */
export function newId(): string {
  return randomUUID();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Device-local calendar date as YYYY-MM-DD. */
export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Current instant as an ISO-8601 UTC string. */
export function nowIso(): string {
  return new Date().toISOString();
}
