import { newId } from '@/features/gym/workout/ids';
import {
  createMemoryStorage,
  setStorageForTests,
  type KvStorage,
} from '@/features/gym/workout/storage';
import { sessionProgress, workingSets } from '@/features/gym/workout/workout-model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coachSyncInputSchema } from '@chefer/types';
import {
  activeWorkouts,
  addClientWorkout,
  applyFinish,
  applySyncResult,
  buildSyncInput,
  clearCoachState,
  coachStorageKey,
  createCoachState,
  dispatchToClient,
  finishPlan,
  loadCoachState,
  pendingWorkouts,
  saveCoachState,
  selectClient,
  type CoachState,
} from './coach-state';
import { coachStart, TODAY } from './test-fixtures';

const AT = '2026-10-20T15:10:00.000Z';
const opts = { today: TODAY, now: '2026-10-20T15:00:00.000Z', newId };

function twoClients(): CoachState {
  let s = createCoachState({ ownerId: 'ana', bookingId: 'b1', activeClientId: null });
  s = addClientWorkout(s, coachStart('maria', 'Maria Pop'), opts);
  s = addClientWorkout(s, coachStart('tom', 'Tom Ionescu'), opts);
  return s;
}

/** Ticks the first working set of the first exercise. */
function tickFirst(s: CoachState, clientId: string): CoachState {
  const doc = s.workouts[clientId]?.doc;
  const se = doc?.exercises[0];
  const set = se ? workingSets(se)[0] : undefined;
  if (!se || !set) throw new Error('no set');
  return dispatchToClient(s, clientId, { type: 'completeSet', seId: se.id, setId: set.id, at: AT });
}

describe('per-client workouts', () => {
  it('starts a workout from the client prescription and makes it active', () => {
    const s = addClientWorkout(
      createCoachState({ ownerId: 'ana', bookingId: 'b1', activeClientId: null }),
      coachStart('maria', 'Maria Pop', { unit: 'LB' }),
      opts,
    );
    const maria = s.workouts['maria'];
    expect(s.activeClientId).toBe('maria');
    expect(maria?.unit).toBe('LB');
    expect(maria?.doc?.name).toBe('Lower body A');
    expect(maria?.doc?.routineDayId).toBe('day-a');
    expect(maria?.doc?.localDate).toBe(TODAY);
    expect(maria?.doc?.status).toBe('IN_PROGRESS');
  });

  it('keeps each client’s sets when switching, and starting again never overwrites', () => {
    let s = tickFirst(twoClients(), 'maria');
    s = selectClient(s, 'tom');
    s = tickFirst(s, 'tom');
    s = tickFirst(s, 'tom'); // idempotent tick of the same set
    s = selectClient(s, 'maria');
    const mariaDoc = s.workouts['maria']?.doc;
    expect(mariaDoc && sessionProgress(mariaDoc).done).toBe(1);
    const again = addClientWorkout(s, coachStart('maria', 'Maria Pop'), opts);
    expect(again.workouts['maria']?.doc).toBe(mariaDoc);
    expect(again.workouts['tom']?.doc && sessionProgress(again.workouts['tom'].doc).done).toBe(1);
  });

  it('an action on one client leaves the other untouched', () => {
    const before = twoClients();
    const after = tickFirst(before, 'maria');
    expect(after.workouts['tom']).toBe(before.workouts['tom']);
  });

  it('a client with no routine has no doc and nothing to finish', () => {
    const s = addClientWorkout(
      createCoachState({ ownerId: 'ana', bookingId: null, activeClientId: 'maria' }),
      coachStart('maria', 'Maria Pop', { workout: null }),
      opts,
    );
    expect(s.workouts['maria']?.doc).toBeNull();
    expect(activeWorkouts(s)).toHaveLength(0);
    expect(finishPlan(s, { kind: 'this', clientId: 'maria' }).finish).toEqual([]);
  });
});

describe('finish this vs finish everyone', () => {
  it('finish this: only that client is COMPLETED; the chip moves to one still training', () => {
    const s = applyFinish(
      tickFirst(twoClients(), 'maria'),
      { kind: 'this', clientId: 'maria' },
      AT,
    );
    expect(s.workouts['maria']?.phase).toBe('finished');
    expect(s.workouts['maria']?.doc?.status).toBe('COMPLETED');
    expect(s.workouts['maria']?.doc?.finishedAt).toBe(AT);
    expect(s.workouts['tom']?.phase).toBe('active');
    expect(s.activeClientId).toBe('tom');
    expect(s.exitWhenSynced).toBe(false);
  });

  it('finish this on the last one with nobody unstarted: leave once synced', () => {
    let s = applyFinish(tickFirst(twoClients(), 'maria'), { kind: 'this', clientId: 'maria' }, AT);
    s = applyFinish(s, { kind: 'this', clientId: 'tom' }, AT);
    expect(s.exitWhenSynced).toBe(true);
    // A booking client not started yet keeps the page open (they may still train).
    const withUnstarted = applyFinish(
      applyFinish(twoClients(), { kind: 'this', clientId: 'maria' }, AT),
      { kind: 'this', clientId: 'tom' },
      AT,
      ['ion'],
    );
    expect(withUnstarted.exitWhenSynced).toBe(false);
  });

  it('finish everyone: finishes ticked workouts, drops untouched ones, leaves', () => {
    const s0 = tickFirst(twoClients(), 'maria');
    expect(finishPlan(s0, { kind: 'all' })).toEqual({ finish: ['maria'], drop: ['tom'] });
    const s = applyFinish(s0, { kind: 'all' }, AT);
    expect(s.workouts['maria']?.doc?.status).toBe('COMPLETED');
    expect(s.workouts['tom']).toBeUndefined();
    expect(pendingWorkouts(s).map((w) => w.clientId)).toEqual(['maria']);
    expect(s.exitWhenSynced).toBe(true);
  });

  it('a finished workout no longer takes reducer actions', () => {
    const s = applyFinish(
      tickFirst(twoClients(), 'maria'),
      { kind: 'this', clientId: 'maria' },
      AT,
    );
    expect(tickFirst(s, 'maria')).toBe(s);
  });
});

describe('sync payload', () => {
  it('is the normal session doc plus the booking, never a loggedById', () => {
    const s = applyFinish(
      tickFirst(twoClients(), 'maria'),
      { kind: 'this', clientId: 'maria' },
      AT,
    );
    const doc = s.workouts['maria']?.doc;
    if (!doc) throw new Error('no doc');
    const input = buildSyncInput('maria', doc, 'b1');
    expect(input.clientId).toBe('maria');
    expect(input.docs).toHaveLength(1);
    expect(input.docs[0]).toMatchObject({ id: doc.id, status: 'COMPLETED', bookingId: 'b1' });
    expect(JSON.stringify(input)).not.toContain('loggedBy');
    expect(coachSyncInputSchema.safeParse(input).success).toBe(true);
  });

  it('carries a null booking for "Log a workout for Maria"', () => {
    const s = applyFinish(
      addClientWorkout(
        createCoachState({ ownerId: 'ana', bookingId: null, activeClientId: 'maria' }),
        coachStart('maria', 'Maria'),
        opts,
      ),
      { kind: 'this', clientId: 'maria' },
      AT,
    );
    const doc = s.workouts['maria']?.doc;
    if (!doc) throw new Error('no doc');
    const input = buildSyncInput('maria', doc, null);
    expect(input.docs[0]?.bookingId).toBeNull();
    expect(coachSyncInputSchema.safeParse(input).success).toBe(true);
  });

  it('applied → synced; rejected or a network error keeps the doc for a retry', () => {
    const s = applyFinish(
      tickFirst(twoClients(), 'maria'),
      { kind: 'this', clientId: 'maria' },
      AT,
    );
    const id = s.workouts['maria']?.doc?.id ?? '';
    const offline = applySyncResult(s, 'maria', { error: 'Failed to fetch' });
    expect(offline.workouts['maria']).toMatchObject({
      phase: 'finished',
      syncError: 'Failed to fetch',
    });
    const rejected = applySyncResult(offline, 'maria', {
      result: { id, status: 'rejected', reason: 'bad' },
    });
    expect(rejected.workouts['maria']).toMatchObject({ phase: 'finished', syncError: 'bad' });
    const ok = applySyncResult(rejected, 'maria', { result: { id, status: 'applied' } });
    expect(ok.workouts['maria']).toMatchObject({ phase: 'synced', syncError: null });
    expect(pendingWorkouts(ok)).toHaveLength(0);
  });
});

describe('persistence per booking', () => {
  let storage: KvStorage;
  beforeEach(() => {
    storage = createMemoryStorage();
    setStorageForTests(storage);
  });
  afterEach(() => setStorageForTests(null));

  it('round-trips every client’s workout under the booking key', () => {
    const key = coachStorageKey('b1', null);
    const s = tickFirst(twoClients(), 'tom');
    saveCoachState(key, s);
    const loaded = loadCoachState(key, 'ana');
    expect(loaded?.workouts['tom']?.doc).toEqual(s.workouts['tom']?.doc);
    expect(loaded?.workouts['maria']?.doc).toEqual(s.workouts['maria']?.doc);
    expect(coachStorageKey(null, 'maria')).not.toBe(key);
    clearCoachState(key);
    expect(loadCoachState(key, 'ana')).toBeNull();
  });

  it('ignores another trainer’s state, corrupt JSON, and re-asks no-routine clients', () => {
    const key = coachStorageKey('b1', null);
    let s = twoClients();
    s = addClientWorkout(s, coachStart('ion', 'Ion', { workout: null }), opts);
    saveCoachState(key, s);
    expect(loadCoachState(key, 'someone-else')).toBeNull();
    expect(loadCoachState(key, 'ana')?.workouts['ion']).toBeUndefined();
    storage.setItem(key, '{not json');
    expect(loadCoachState(key, 'ana')).toBeNull();
  });
});
