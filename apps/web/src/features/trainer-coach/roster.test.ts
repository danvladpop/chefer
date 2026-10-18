import { newId } from '@/features/gym/workout/ids';
import { describe, expect, it } from 'vitest';
import { addClientWorkout, applyFinish, createCoachState } from './coach-state';
import { chipStatus, coachRoster, pickActiveClient, unstartedClients } from './roster';
import { booking, coachStart, TODAY } from './test-fixtures';

const opts = { today: TODAY, now: '2026-10-20T15:00:00.000Z', newId };
const empty = () => createCoachState({ ownerId: 'ana', bookingId: 'b1', activeClientId: null });

describe('coachRoster', () => {
  it('lists the booking’s clients without cancelled ones, flagging those already logged', () => {
    const roster = coachRoster({
      booking: booking([
        { clientId: 'maria', name: 'Maria' },
        { clientId: 'tom', name: 'Tom', attendance: 'CANCELLED' },
        { clientId: 'ion', name: 'Ion', attendance: 'ATTENDED', workoutSessionId: 'ws1' },
      ]),
      state: empty(),
      clientId: null,
    });
    expect(roster).toEqual([
      { clientId: 'maria', name: 'Maria', alreadyLogged: false },
      { clientId: 'ion', name: 'Ion', alreadyLogged: true },
    ]);
  });

  it('falls back to the saved workouts when the booking cannot load (offline reload)', () => {
    const state = addClientWorkout(empty(), coachStart('maria', 'Maria'), opts);
    expect(coachRoster({ booking: undefined, state, clientId: null })).toEqual([
      { clientId: 'maria', name: 'Maria', alreadyLogged: false },
    ]);
  });

  it('"Log a workout for Maria": just that client', () => {
    expect(coachRoster({ booking: undefined, state: empty(), clientId: 'maria' })).toEqual([
      { clientId: 'maria', name: '', alreadyLogged: false },
    ]);
  });
});

describe('which chip opens', () => {
  const roster = [
    { clientId: 'ion', name: 'Ion', alreadyLogged: true },
    { clientId: 'maria', name: 'Maria', alreadyLogged: false },
    { clientId: 'tom', name: 'Tom', alreadyLogged: false },
  ];
  it('the saved choice, else the one asked for, else the first still to log', () => {
    expect(pickActiveClient(roster, empty(), null)).toBe('maria');
    expect(pickActiveClient(roster, empty(), 'tom')).toBe('tom');
    expect(pickActiveClient(roster, { ...empty(), activeClientId: 'ion' }, 'tom')).toBe('ion');
    expect(pickActiveClient(roster, empty(), 'stranger')).toBe('maria');
  });

  const at = (i: number) => {
    const c = roster[i];
    if (!c) throw new Error('no client');
    return c;
  };
  it('unstarted clients and chip states', () => {
    let state = addClientWorkout(empty(), coachStart('maria', 'Maria'), opts);
    expect(unstartedClients(roster, state)).toEqual(['tom']);
    expect(chipStatus(at(1), state)).toEqual({ status: 'active', progress: '0/6' });
    expect(chipStatus(at(2), state)).toEqual({ status: 'new', progress: null });
    expect(chipStatus(at(0), state).status).toBe('saved');
    state = applyFinish(state, { kind: 'this', clientId: 'maria' }, '2026-10-20T16:00:00.000Z');
    expect(chipStatus(at(1), state).status).toBe('saved');
  });
});
