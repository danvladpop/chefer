import type { SyncResultDto } from '@chefer/types';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox as ownerOutbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { getRestTimer, resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import type { CoachedDoc } from '../../src/features/trainer-coach/coach-model';
import {
  coachedOutboxes,
  createCoachedOutboxes,
} from '../../src/features/trainer-coach/coached-outbox';
import {
  coachedSessionStore,
  createCoachedSessionStore,
} from '../../src/features/trainer-coach/coached-session-store';
import {
  discardCoached,
  dispatchCoached,
  finishCoached,
  finishCoachedGroup,
  finishCoachedWithDefaults,
  startCoachedWorkout,
} from '../../src/features/trainer-coach/coached-workouts';
import { makeDoc } from './gym-fixtures';
import { BOOKING, coachStart, ION, MARIA } from './trainer-coach-fixtures';

// Trainer mode M3 (trainer-mode.md §6.7, §12): a group booking runs one coached
// workout per client, each kept while switching; Finish is "this one" or
// "everyone"; finished docs wait in a per-client outbox synced through
// trainer.coach.sync — never the trainer's own queue.

jest.mock('expo-crypto', () => {
  let n = 2000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

/** Lets in-flight flushes settle (each is a few promise hops). */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const TRAINER = 'trainer-1';

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  setGymOwner(TRAINER);
  coachedSessionStore.reload();
  coachedOutboxes.configure(null);
  coachedOutboxes.reload();
  ownerOutbox.reload();
  activeSessionStore.clear();
  resetRestTimerForTests();
});

function startGroup() {
  const maria = startCoachedWorkout(coachStart(MARIA, 'Maria Pop'), BOOKING, {
    order: 0,
    group: true,
  });
  const ion = startCoachedWorkout(coachStart(ION, 'Ion Rusu'), BOOKING, { order: 1, group: true });
  if (!maria || !ion) throw new Error('not started');
  return { maria, ion };
}

const firstWorkingSet = (clientId: string) => {
  const se = coachedSessionStore.find(BOOKING, clientId)?.doc.exercises[0];
  const set = se?.sets.find((s) => !s.isWarmup);
  if (!se || !set) throw new Error('no set');
  return { seId: se.id, setId: set.id, set };
};

describe('per-client workouts', () => {
  it('a group booking keeps one persisted workout per client, each its own state', () => {
    startGroup();
    expect(track).toHaveBeenCalledWith('coached_workout_started', { group: true });

    const m = firstWorkingSet(MARIA);
    dispatchCoached(BOOKING, MARIA, { type: 'completeSet', ...m, weightKg: 62.5, reps: 9 });
    const i = firstWorkingSet(ION);
    dispatchCoached(BOOKING, ION, { type: 'editSet', ...i, reps: 12 });

    // "Switching" is reading another record: each kept its own change.
    expect(firstWorkingSet(MARIA).set).toMatchObject({ weightKg: 62.5, reps: 9 });
    expect(firstWorkingSet(MARIA).set.completedAt).not.toBeNull();
    expect(firstWorkingSet(ION).set).toMatchObject({ reps: 12, completedAt: null });
    // A tick starts the rest timer like the trainer's own logger.
    expect(getRestTimer()).toMatchObject({ durationSec: 120 });

    // A relaunch (fresh store over the same KV) finds both, in booking order.
    const relaunched = createCoachedSessionStore();
    expect(relaunched.all().map((r) => r.client.id)).toEqual([MARIA, ION]);
    expect(
      relaunched.find(BOOKING, MARIA)?.doc.exercises[0]?.sets.some((s) => s.weightKg === 62.5),
    ).toBe(true);
  });

  it('never touches the trainer’s own active session — both coexist', () => {
    const own = makeDoc(9, { status: 'IN_PROGRESS', finishedAt: null, name: 'My push day' });
    activeSessionStore.set(own, TRAINER);
    startGroup();
    finishCoachedGroup(BOOKING);
    expect(activeSessionStore.get()?.doc).toBe(own);
  });

  it('starting again returns the workout in progress (never overwrites it)', () => {
    const { maria } = startGroup();
    const again = startCoachedWorkout(coachStart(MARIA, 'Maria Pop'), BOOKING, {
      order: 0,
      group: true,
    });
    expect(again?.doc.id).toBe(maria.doc.id);
  });

  it('no routine: nothing starts', () => {
    expect(
      startCoachedWorkout(coachStart(MARIA, 'Maria Pop', { workout: null }), BOOKING, {
        order: 0,
        group: false,
      }),
    ).toBeNull();
    expect(coachedSessionStore.all()).toHaveLength(0);
  });
});

describe('finish this one vs everyone', () => {
  it('"Finish Maria’s workout" queues hers, Ion keeps going', () => {
    startGroup();
    const m = firstWorkingSet(MARIA);
    dispatchCoached(BOOKING, MARIA, { type: 'completeSet', ...m, weightKg: 60, reps: 10 });

    const doc = finishCoachedWithDefaults(BOOKING, MARIA);
    expect(doc?.status).toBe('COMPLETED');
    expect(coachedSessionStore.find(BOOKING, MARIA)).toBeNull();
    expect(coachedSessionStore.find(BOOKING, ION)).not.toBeNull();
    const queued = coachedOutboxes.forClient(MARIA).getState().entries;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ ownerId: TRAINER });
    expect((queued[0]?.doc as CoachedDoc).bookingId).toBe(BOOKING);
    expect(coachedOutboxes.hasQueued(MARIA, BOOKING)).toBe(true);
    expect(track).toHaveBeenCalledWith('coached_workout_finished', {});
  });

  it('"Finish everyone" queues every client’s workout, each in their own outbox', () => {
    startGroup();
    const finished = finishCoachedGroup(BOOKING);
    expect(finished).toHaveLength(2);
    expect(coachedSessionStore.all()).toHaveLength(0);
    expect(coachedOutboxes.forClient(MARIA).getState().entries).toHaveLength(1);
    expect(coachedOutboxes.forClient(ION).getState().entries).toHaveLength(1);
    // Never the trainer's own queue.
    expect(ownerOutbox.getState().entries).toHaveLength(0);
  });

  it('unstarted exercises carry over to the client’s next session; sets are confirmed loads', () => {
    startGroup();
    const doc = finishCoached(BOOKING, MARIA, ['squat']);
    expect(doc?.carryOverExerciseIds).toEqual(['squat']);
    expect(doc?.exercises.flatMap((e) => e.sets).some((s) => s.loadConfirmed === false)).toBe(
      false,
    );
  });

  it('discard drops the workout and queues nothing', () => {
    startGroup();
    expect(discardCoached(BOOKING, MARIA)?.status).toBe('DISCARDED');
    expect(coachedSessionStore.find(BOOKING, MARIA)).toBeNull();
    expect(coachedOutboxes.totalCount()).toBe(0);
  });
});

describe('coached outbox', () => {
  function setup() {
    let online = false;
    const triggers: { flush: () => void }[] = [];
    const boxes = createCoachedOutboxes({
      prefix: 'gym.coach.outbox-test',
      isOnline: () => online,
      getOwnerId: () => TRAINER,
      getStampOwnerId: () => TRAINER,
      flushOnEnqueue: true,
      // The reconnect trigger, as startOutboxTriggers wires onlineManager.
      startTriggers: (box) => {
        triggers.push({ flush: () => void box.flush({ force: true }) });
        return () => undefined;
      },
    });
    const send = jest.fn((_clientId: string, docs: CoachedDoc[]) =>
      Promise.resolve(docs.map((d): SyncResultDto => ({ id: d.id, status: 'applied' }))),
    );
    const onSynced = jest.fn();
    boxes.configure({ send, onSynced });
    boxes.start();
    return {
      boxes,
      send,
      onSynced,
      reconnect: async () => {
        online = true;
        triggers.forEach((t) => t.flush());
        await settle();
      },
    };
  }

  it('queues offline and flushes on reconnect: one coach.sync per client, with the booking', async () => {
    const { boxes, send, onSynced, reconnect } = setup();
    const maria = makeDoc(31);
    const ion = makeDoc(32);
    boxes.enqueue(MARIA, { ...maria, bookingId: BOOKING });
    boxes.enqueue(ION, { ...ion, bookingId: null });
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(boxes.pendingCount(TRAINER)).toBe(2);

    await reconnect();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(MARIA, [
      expect.objectContaining({ id: maria.id, bookingId: BOOKING }),
    ]);
    expect(send).toHaveBeenCalledWith(ION, [
      expect.objectContaining({ id: ion.id, bookingId: null }),
    ]);
    expect(onSynced).toHaveBeenCalledWith(MARIA, [maria.id]);
    expect(onSynced).toHaveBeenCalledWith(ION, [ion.id]);
    expect(boxes.pendingCount(TRAINER)).toBe(0);
    // The trainer's own queue never saw them.
    expect(ownerOutbox.getState().entries).toHaveLength(0);
  });

  it('idempotent: the client UUID keys the queue — re-enqueueing replaces, never duplicates', async () => {
    const { boxes, send, reconnect } = setup();
    const doc = makeDoc(40, { clientUpdatedAt: '2026-10-19T19:00:00.000Z' });
    boxes.enqueue(MARIA, { ...doc, bookingId: BOOKING });
    boxes.enqueue(MARIA, {
      ...doc,
      bookingId: BOOKING,
      clientUpdatedAt: '2026-10-19T19:01:00.000Z',
    });
    expect(boxes.forClient(MARIA).getState().entries).toHaveLength(1);
    await settle();
    await reconnect();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1].map((d) => d.id)).toEqual([doc.id]);
  });

  it('survives a relaunch offline: the queue is discovered from the phone', async () => {
    const first = setup();
    first.boxes.enqueue(MARIA, { ...makeDoc(50), bookingId: BOOKING });
    const relaunched = createCoachedOutboxes({
      prefix: 'gym.coach.outbox-test',
      getOwnerId: () => TRAINER,
      flushOnEnqueue: false,
      startTriggers: () => () => undefined,
    });
    expect(relaunched.totalCount()).toBe(1);
    const send = jest.fn((_c: string, docs: CoachedDoc[]) =>
      Promise.resolve(docs.map((d): SyncResultDto => ({ id: d.id, status: 'applied' }))),
    );
    relaunched.configure({ send });
    await relaunched.flushAll({ force: true });
    expect(send).toHaveBeenCalledWith(MARIA, [expect.objectContaining({ bookingId: BOOKING })]);
  });

  it('a network failure keeps the doc for the next try', async () => {
    const { boxes, send, reconnect } = setup();
    send.mockRejectedValueOnce(new TypeError('Network request failed'));
    boxes.enqueue(MARIA, { ...makeDoc(60), bookingId: BOOKING });
    await settle();
    await reconnect();
    expect(boxes.pendingCount(TRAINER)).toBe(1);
    await boxes.flushAll({ force: true });
    expect(boxes.pendingCount(TRAINER)).toBe(0);
  });
});
