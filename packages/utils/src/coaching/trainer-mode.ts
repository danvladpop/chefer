// Trainer mode (docs/prd-2026-10/trainer-mode.md): the pure rules both apps
// and the API share — who gets the mode, the dashboard numbers, the badge sum,
// and how the Clients tab filters and sorts.
import {
  COACHING_LIMITS,
  type AppShellMode,
  type ClientRowDto,
  type TrainerBadgesDto,
  type TrainerDashboardSummaryDto,
  type TrainerQuietClientDto,
} from '@chefer/types';
import { matchesAllTokens, normalizeSearchName, queryTokens } from '../friends/search-name';

/**
 * §5.1: the switch exists only for an active trainer (tools on, not removed
 * from the allowlist) with the `trainerMode` flag on. Anything unknown is no.
 */
export function isTrainerModeAvailable(input: {
  flag: boolean | undefined;
  trainerActive: boolean | undefined;
}): boolean {
  return input.flag === true && input.trainerActive === true;
}

/** The mode to render: a remembered `trainer` falls back to personal once the mode is gone (§5.1). */
export function effectiveShellMode(remembered: AppShellMode, available: boolean): AppShellMode {
  return remembered === 'trainer' && available ? 'trainer' : 'personal';
}

/** `trainer.badges`: one count source (§7.1). */
export function trainerBadges(parts: Omit<TrainerBadgesDto, 'total'>): TrainerBadgesDto {
  return { ...parts, total: parts.requests + parts.unmarkedAttendance + parts.bookingChanges };
}

/** A client with nothing logged for COACHING_LIMITS.inactiveDays or more. */
export function isQuietClient(row: Pick<ClientRowDto, 'inactiveDays'>): boolean {
  return row.inactiveDays >= COACHING_LIMITS.inactiveDays;
}

/**
 * Average adherence (§6.1): per client with a weekly goal, completed sessions
 * in the last 7 days ÷ the goal, capped at 1; then the mean. Null when no
 * client has a goal, so a new trainer reads "No goals yet" rather than 0 %.
 */
export function averageAdherence(
  clients: readonly { goal: number; sessionsLast7: number }[],
): number | null {
  const judged = clients.filter((c) => c.goal > 0);
  if (judged.length === 0) return null;
  const sum = judged.reduce((acc, c) => acc + Math.min(1, c.sessionsLast7 / c.goal), 0);
  return sum / judged.length;
}

/** `trainer.dashboard.summary` from the client list, last-7-day counts and the request count. */
export function summarizeTrainerDashboard(input: {
  clients: readonly ClientRowDto[];
  /** Completed sessions per client id in the 7 days ending today. */
  sessionsLast7: ReadonlyMap<string, number>;
  requestsWaiting: number;
}): TrainerDashboardSummaryDto {
  const quietClients: TrainerQuietClientDto[] = input.clients
    .filter(isQuietClient)
    .map((row) => ({
      clientId: row.clientId,
      name: row.name,
      lastWorkoutDate: row.lastWorkoutDate,
      inactiveDays: row.inactiveDays,
    }))
    .sort((a, b) => b.inactiveDays - a.inactiveDays || a.name.localeCompare(b.name));
  return {
    activeClients: input.clients.length,
    maxClients: COACHING_LIMITS.maxActiveClients,
    requestsWaiting: input.requestsWaiting,
    averageAdherence: averageAdherence(
      input.clients.map((row) => ({
        goal: row.week.goal,
        sessionsLast7: input.sessionsLast7.get(row.clientId) ?? 0,
      })),
    ),
    quietClients,
    bookingsThisWeek: null,
  };
}

// ─── Clients tab (§6.4) ───────────────────────────────────────────────────────

/** Name, last workout, or (M3) next booking. */
export type ClientSort = 'name' | 'lastWorkout' | 'nextBooking';

/** Every query token is a prefix of a name token ("ma po" finds "Maria Pop"); an empty query keeps all. */
export function filterClients<T extends Pick<ClientRowDto, 'name' | 'label'>>(
  rows: readonly T[],
  query: string,
): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [...rows];
  return rows.filter(
    (row) =>
      matchesAllTokens(normalizeSearchName(row.name, null), tokens) ||
      (row.label !== null && matchesAllTokens(normalizeSearchName(row.label, null), tokens)),
  );
}

/**
 * Name A→Z; the most recent workout first (never-trained clients last); or
 * the soonest next booking first (clients with none last, by name).
 */
export function sortClients<
  T extends Pick<ClientRowDto, 'name' | 'lastWorkoutDate' | 'nextBookingAt'>,
>(rows: readonly T[], sort: ClientSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  if (sort === 'name') return [...rows].sort(byName);
  if (sort === 'nextBooking') {
    return [...rows].sort((a, b) => {
      const x = a.nextBookingAt ? Date.parse(a.nextBookingAt) : Infinity;
      const y = b.nextBookingAt ? Date.parse(b.nextBookingAt) : Infinity;
      return x === y ? byName(a, b) : x - y;
    });
  }
  return [...rows].sort((a, b) => {
    if (a.lastWorkoutDate === b.lastWorkoutDate) return byName(a, b);
    if (a.lastWorkoutDate === null) return 1;
    if (b.lastWorkoutDate === null) return -1;
    return a.lastWorkoutDate < b.lastWorkoutDate ? 1 : -1;
  });
}
