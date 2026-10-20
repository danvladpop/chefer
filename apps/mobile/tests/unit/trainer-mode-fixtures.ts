import {
  ALL_FEATURE_FLAGS_OFF,
  type TrainerBadgesDto,
  type TrainerDashboardSummaryDto,
} from '@chefer/types';
import type { Handlers } from './friends-core-harness';
import { MARIA, trainerHandlers } from './trainer-fixtures';

// Trainer mode (docs/prd-2026-10/trainer-mode.md) fixtures, on top of the trainer-* ones: the
// `trainerMode` flag on, an active trainer, and the two new procedures answering.

export function badges(overrides: Partial<TrainerBadgesDto> = {}): TrainerBadgesDto {
  const parts = { requests: 0, unmarkedAttendance: 0, bookingChanges: 0, ...overrides };
  return { ...parts, total: parts.requests + parts.unmarkedAttendance + parts.bookingChanges };
}

export function summary(
  overrides: Partial<TrainerDashboardSummaryDto> = {},
): TrainerDashboardSummaryDto {
  return {
    activeClients: 23,
    maxClients: 50,
    requestsWaiting: 0,
    averageAdherence: 0.67,
    quietClients: [
      { clientId: MARIA, name: 'Maria Pop', lastWorkoutDate: '2026-10-09', inactiveDays: 9 },
    ],
    bookingsThisWeek: null,
    ...overrides,
  };
}

/** An active trainer with `trainerMode` on; Following off unless overridden. */
export function trainerModeHandlers(overrides: Handlers = {}): Handlers {
  return trainerHandlers({
    'profile.flags': () => ({ ...ALL_FEATURE_FLAGS_OFF, coaching: true, trainerMode: true }),
    'trainer.badges': () => badges(),
    'trainer.dashboard.summary': () => summary(),
    'trainer.requests.list': () => [],
    'trainer.invites.list': () => [],
    'coaching.notices': () => [],
    'friends.availability': () => ({ enabled: false }),
    ...overrides,
  });
}
