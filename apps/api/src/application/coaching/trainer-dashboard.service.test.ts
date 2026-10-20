import { describe, expect, it, vi } from 'vitest';
import type { ClientRowDto, TrainerRequestDto } from '@chefer/types';
import { TrainerDashboardService } from './trainer-dashboard.service.js';

// The default singletons pull in lib/env.js; the unit-test job has no env.
vi.mock('./coaching-link.service.js', () => ({ coachingLinkService: {} }));
vi.mock('./coaching-request.service.js', () => ({ coachingRequestService: {} }));

// trainer.badges / trainer.dashboard.summary (trainer-mode.md §6.1, §7.1): the
// numbers come from the same lists the Clients tab shows.

const TODAY = '2026-10-18';

function client(id: string, over: Partial<ClientRowDto> = {}): ClientRowDto {
  return {
    clientId: id,
    name: `Client ${id}`,
    since: '2026-10-01T00:00:00.000Z',
    label: null,
    lastWorkoutDate: '2026-10-17',
    week: { sessions: 1, goal: 2 },
    inactiveDays: 1,
    routineChangedByClientAt: null,
    ...over,
  };
}

const request = (id: string) => ({ id }) as TrainerRequestDto;

function make(clients: ClientRowDto[], requests: TrainerRequestDto[], counts = new Map()) {
  const deps = {
    links: { listClients: vi.fn(async () => clients) },
    requests: { listForTrainer: vi.fn(async () => requests) },
    content: { countSessions: vi.fn(async () => counts) },
  };
  return { service: new TrainerDashboardService(deps), deps };
}

describe('TrainerDashboardService', () => {
  it('badges: pending requests, with attendance and booking changes at 0 before bookings exist', async () => {
    const { service } = make([], [request('r1'), request('r2')]);
    expect(await service.badges('t1')).toEqual({
      requests: 2,
      unmarkedAttendance: 0,
      bookingChanges: 0,
      total: 2,
    });
  });

  it('summary: counts the last 7 days ending today for every client', async () => {
    const counts = new Map([
      ['a', 2],
      ['b', 1],
    ]);
    const { service, deps } = make(
      [client('a'), client('b', { inactiveDays: 8, lastWorkoutDate: '2026-10-10' })],
      [request('r1')],
      counts,
    );
    const summary = await service.summary('t1', TODAY);
    expect(deps.links.listClients).toHaveBeenCalledWith('t1', TODAY);
    expect(deps.content.countSessions).toHaveBeenCalledWith(['a', 'b'], '2026-10-12', TODAY);
    expect(summary).toEqual({
      activeClients: 2,
      maxClients: 50,
      requestsWaiting: 1,
      averageAdherence: 0.75,
      quietClients: [
        { clientId: 'b', name: 'Client b', lastWorkoutDate: '2026-10-10', inactiveDays: 8 },
      ],
      bookingsThisWeek: null,
    });
  });

  it('summary: a brand-new trainer runs no session query', async () => {
    const { service, deps } = make([], []);
    expect(await service.summary('t1', TODAY)).toMatchObject({
      activeClients: 0,
      requestsWaiting: 0,
      averageAdherence: null,
    });
    expect(deps.content.countSessions).not.toHaveBeenCalled();
  });
});
