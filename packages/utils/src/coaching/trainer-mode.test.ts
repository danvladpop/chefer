import { describe, expect, it } from 'vitest';
import type { ClientRowDto } from '@chefer/types';
import {
  averageAdherence,
  effectiveShellMode,
  filterClients,
  isTrainerModeAvailable,
  sortClients,
  summarizeTrainerDashboard,
  trainerBadges,
} from './trainer-mode';

function row(over: Partial<ClientRowDto> & { clientId: string; name: string }): ClientRowDto {
  return {
    since: '2026-10-01T00:00:00.000Z',
    label: null,
    lastWorkoutDate: '2026-10-17',
    week: { sessions: 1, goal: 3 },
    inactiveDays: 1,
    routineChangedByClientAt: null,
    ...over,
  };
}

describe('isTrainerModeAvailable / effectiveShellMode', () => {
  it('needs both the flag and active trainer tools', () => {
    expect(isTrainerModeAvailable({ flag: true, trainerActive: true })).toBe(true);
    expect(isTrainerModeAvailable({ flag: false, trainerActive: true })).toBe(false);
    expect(isTrainerModeAvailable({ flag: true, trainerActive: false })).toBe(false);
    expect(isTrainerModeAvailable({ flag: undefined, trainerActive: undefined })).toBe(false);
  });

  it('a remembered trainer mode falls back to personal once the mode is gone', () => {
    expect(effectiveShellMode('trainer', true)).toBe('trainer');
    expect(effectiveShellMode('trainer', false)).toBe('personal');
    expect(effectiveShellMode('personal', true)).toBe('personal');
  });
});

describe('trainerBadges', () => {
  it('sums every part', () => {
    expect(trainerBadges({ requests: 2, unmarkedAttendance: 1, bookingChanges: 3 })).toEqual({
      requests: 2,
      unmarkedAttendance: 1,
      bookingChanges: 3,
      total: 6,
    });
  });
});

describe('averageAdherence', () => {
  it('caps each client at 100 % and skips clients without a goal', () => {
    expect(
      averageAdherence([
        { goal: 3, sessionsLast7: 6 },
        { goal: 4, sessionsLast7: 2 },
        { goal: 0, sessionsLast7: 5 },
      ]),
    ).toBe(0.75);
  });

  it('is null when nobody has a goal', () => {
    expect(averageAdherence([])).toBeNull();
    expect(averageAdherence([{ goal: 0, sessionsLast7: 1 }])).toBeNull();
  });
});

describe('summarizeTrainerDashboard', () => {
  it('counts clients, lists quiet ones most inactive first, and leaves bookings null', () => {
    const clients = [
      row({ clientId: 'a', name: 'Maria', inactiveDays: 9, lastWorkoutDate: '2026-10-09' }),
      row({ clientId: 'b', name: 'Ion', inactiveDays: 2 }),
      row({ clientId: 'c', name: 'Dana', inactiveDays: 14, lastWorkoutDate: null }),
    ];
    const summary = summarizeTrainerDashboard({
      clients,
      sessionsLast7: new Map([
        ['b', 3],
        ['a', 0],
      ]),
      requestsWaiting: 2,
    });
    expect(summary).toEqual({
      activeClients: 3,
      maxClients: 50,
      requestsWaiting: 2,
      averageAdherence: 1 / 3,
      quietClients: [
        { clientId: 'c', name: 'Dana', lastWorkoutDate: null, inactiveDays: 14 },
        { clientId: 'a', name: 'Maria', lastWorkoutDate: '2026-10-09', inactiveDays: 9 },
      ],
      bookingsThisWeek: null,
    });
  });

  it('reads well for a brand-new trainer', () => {
    expect(
      summarizeTrainerDashboard({ clients: [], sessionsLast7: new Map(), requestsWaiting: 0 }),
    ).toMatchObject({ activeClients: 0, averageAdherence: null, quietClients: [] });
  });
});

describe('filterClients / sortClients', () => {
  const rows = [
    row({ clientId: '1', name: 'Maria Popescu', lastWorkoutDate: '2026-10-10' }),
    row({ clientId: '2', name: 'Ștefan Ionescu', label: 'Tue/Thu', lastWorkoutDate: null }),
    row({ clientId: '3', name: 'Ana Pop', lastWorkoutDate: '2026-10-17' }),
  ];

  it('matches name prefixes, ignoring accents, and the label', () => {
    expect(filterClients(rows, 'pop').map((r) => r.clientId)).toEqual(['1', '3']);
    expect(filterClients(rows, 'stef').map((r) => r.clientId)).toEqual(['2']);
    expect(filterClients(rows, 'tue').map((r) => r.clientId)).toEqual(['2']);
    expect(filterClients(rows, '  ')).toHaveLength(3);
  });

  it('sorts by name, or most recent workout first with never-trained last', () => {
    expect(sortClients(rows, 'name').map((r) => r.clientId)).toEqual(['3', '1', '2']);
    expect(sortClients(rows, 'lastWorkout').map((r) => r.clientId)).toEqual(['3', '1', '2']);
  });
});
