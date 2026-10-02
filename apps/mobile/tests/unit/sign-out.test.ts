import { QueryClient } from '@tanstack/react-query';
import {
  clearPendingOnboarding,
  isOnboardingPending,
  requestOnboarding,
} from '../../src/features/auth/pending-onboarding';
import { getRegisterDraft, setRegisterDraft } from '../../src/features/auth/register-draft';
import { getMode, setMode } from '../../src/features/gym/mode-store';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { getGymOwner, setGymOwner } from '../../src/features/gym/offline/owner';
import { getCachedJobs, setCachedJobs } from '../../src/features/navigation/landing-cache';
import { ONBOARDING_DRAFT_KEY } from '../../src/features/onboarding/onboarding-draft';
import {
  isOnboardingGateHandled,
  markOnboardingGateHandled,
} from '../../src/features/onboarding/onboarding-gate';
import {
  bindSessionQueryClient,
  getToken,
  hasSignedInBefore,
  setToken,
} from '../../src/lib/auth-store';
import { signOut } from '../../src/lib/sign-out';
import { makeDoc } from './gym-fixtures';

// UX-ACC-02 / UX-ACC-12 / UX-ACC-17: ONE sign-out for More, Settings, account
// deletion and the 401 handler — it empties the cache, the device state, the
// reminders and the drafts, in that order, and clears the token last.

const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStore.delete(key);
    return Promise.resolve();
  }),
}));

// Everything that happens, in order — each step also records what the KV looked like.
const events: string[] = [];
let mockKvKeysWhenRemindersCancelled: string[] = [];
const mockKvKeys = (): string[] => kv.keys();
let mockRemindersFail = false;
jest.mock('../../src/features/gym/reminders/cancel-reminders', () => ({
  cancelAllGymReminders: () => {
    events.push('reminders');
    mockKvKeysWhenRemindersCancelled = mockKvKeys();
    return mockRemindersFail ? Promise.reject(new Error('boom')) : Promise.resolve();
  },
}));
const mockCancelNotification = jest.fn((_id: string) => Promise.resolve());
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: (id: string) => mockCancelNotification(id),
  getAllScheduledNotificationsAsync: () => Promise.resolve([]),
}));

/** Every KV key the app writes today, one per feature, plus the two that must survive. */
const ACCOUNT_KEYS: Record<string, string> = {
  [KV_KEYS.mode]: 'gym',
  [KV_KEYS.owner]: 'user-a',
  [KV_KEYS.activeSession]: '{"v":1}',
  [KV_KEYS.outbox]: '{"v":1,"entries":[]}',
  [KV_KEYS.pendingHardDeletes]: '[]',
  [KV_KEYS.queryCache]: '{"clientState":{}}',
  [KV_KEYS.restTimer]: '{"endsAt":1}',
  [`${KV_KEYS.restTimer}.notification`]: 'notif-1',
  [KV_KEYS.timeToday]: '{"0":30}',
  [KV_KEYS.targetNotice]: '{}',
  [KV_KEYS.routineHintsDismissed]: '{}',
  [KV_KEYS.missedDayDismissed]: '{}',
  [`${KV_KEYS.outboxQuarantine}.123`]: 'x',
  'gym.exercise-note.user-a.bench': 'my cue',
  'gym.cardio-timer': '{}',
  'landing.jobs': '["TRAIN"]',
  'landing.has-gym-profile': '1',
  'chefer.pantry-check-week': '2026-W40',
  'premium.nudge-cap': '{}',
  'privacy.health-consent-declined': '1',
  'shop.share-list.prefs.v1': '{}',
  'chefer.rebalance.pending': '{}',
  'plan.dismissed.replan.plan-1': '1',
  [ONBOARDING_DRAFT_KEY]: '{"v":1}',
};
const DEVICE_KEYS: Record<string, string> = { 'analytics.consent': '{"optedOut":true}' };

function seed(keys: Record<string, string>) {
  for (const [key, value] of Object.entries(keys)) kv.setString(key, value);
}

let queryClient: QueryClient;

beforeEach(async () => {
  events.length = 0;
  mockKvKeysWhenRemindersCancelled = [];
  mockRemindersFail = false;
  mockSecureStore.clear();
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  queryClient = new QueryClient();
  bindSessionQueryClient(queryClient);
  await setToken('token-a'); // also marks "has signed in before"
  seed(ACCOUNT_KEYS);
  seed(DEVICE_KEYS);
  queryClient.setQueryData([['preferences', 'get']], {
    dietaryPreferences: { allergies: ['Peanuts'] },
  });
  setRegisterDraft({ email: 'a@example.com', firstName: 'Ana' });
  requestOnboarding();
  markOnboardingGateHandled('token-a');
});

afterEach(() => {
  clearPendingOnboarding();
  queryClient.clear();
});

describe('signOut()', () => {
  it('empties the query cache', async () => {
    await signOut();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getQueryData([['preferences', 'get']])).toBeUndefined();
  });

  it('removes every account key from the device store and keeps the two device ones', async () => {
    await signOut();
    expect(kv.keys().sort()).toEqual(Object.keys(DEVICE_KEYS).sort());
    // …including the per-exercise notes and the plan dismissals, which have
    // dynamic keys no hand-kept list would have covered.
    expect(kv.getString('gym.exercise-note.user-a.bench')).toBeNull();
    expect(kv.getString('plan.dismissed.replan.plan-1')).toBeNull();
    expect(kv.getString('analytics.consent')).toBe('{"optedOut":true}');
  });

  it('forgets the in-memory copies too, so nothing of the old account renders', async () => {
    setMode('gym');
    setCachedJobs(['TRAIN']);
    setGymOwner('user-a');
    activeSessionStore.set(makeDoc(1), 'user-a');
    outbox.enqueue(makeDoc(2), { ownerId: 'user-a' });
    expect(outbox.getState().entries).toHaveLength(1);

    await signOut();

    expect(getMode()).toBe('food');
    expect(getCachedJobs()).toEqual([]);
    expect(getGymOwner()).toBeNull();
    expect(activeSessionStore.get()).toBeNull();
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it('cancels the rest-timer notification and the gym reminders', async () => {
    await signOut();
    expect(mockCancelNotification).toHaveBeenCalledWith('notif-1');
    expect(events).toContain('reminders');
  });

  it('resets the register draft, the pending-onboarding flag and the onboarding gate', async () => {
    await signOut();
    expect(getRegisterDraft()).toBeNull();
    expect(isOnboardingPending()).toBe(false);
    expect(isOnboardingGateHandled('token-a')).toBe(false);
  });

  it('clears the token LAST: after the cache, the device wipe and the reminders', async () => {
    const order: string[] = [];
    const cancelSpy = jest.spyOn(queryClient, 'cancelQueries').mockImplementation(() => {
      order.push('cancelQueries');
      return Promise.resolve();
    });
    const clearSpy = jest.spyOn(queryClient, 'clear').mockImplementation(() => {
      order.push('clear');
    });
    const secure = jest.requireMock<{ deleteItemAsync: jest.Mock }>('expo-secure-store');
    secure.deleteItemAsync.mockImplementationOnce((key: string) => {
      order.push(`token-cleared(kv-keys-left=${kv.keys().length},reminders-done=${events.length})`);
      mockSecureStore.delete(key);
      return Promise.resolve();
    });

    await signOut();

    expect(order).toEqual([
      'cancelQueries',
      'clear',
      'token-cleared(kv-keys-left=1,reminders-done=1)',
    ]);
    // Reminders were cancelled after the KV wipe, before the token went.
    expect(mockKvKeysWhenRemindersCancelled).toEqual(['analytics.consent']);
    expect(getToken()).toBeNull();
    cancelSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('keeps "has signed in before" — the device still says "Welcome back"', async () => {
    await signOut();
    expect(hasSignedInBefore()).toBe(true);
    const secure = jest.requireMock<{ deleteItemAsync: jest.Mock }>('expo-secure-store');
    expect(secure.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(secure.deleteItemAsync).toHaveBeenCalledWith('chefer_session_token');
  });

  it('still clears the token when an earlier step fails', async () => {
    mockRemindersFail = true;
    await signOut();
    expect(getToken()).toBeNull();
  });

  it('runs once for several simultaneous calls (a burst of 401s)', async () => {
    await Promise.all([signOut(), signOut(), signOut()]);
    expect(events.filter((e) => e === 'reminders')).toHaveLength(1);
  });

  describe('session expired (a 401 — the user did not choose to leave)', () => {
    it('keeps unsynced gym workouts for the next login, wipes everything else', async () => {
      await signOut({ reason: 'session-expired' });
      expect(kv.getString(KV_KEYS.outbox)).not.toBeNull();
      expect(kv.getString(KV_KEYS.activeSession)).not.toBeNull();
      expect(kv.getString(KV_KEYS.owner)).toBe('user-a');
      // The gym read cache and every non-gym key still go.
      expect(kv.getString(KV_KEYS.queryCache)).toBeNull();
      expect(kv.getString('landing.jobs')).toBeNull();
      expect(kv.getString(KV_KEYS.mode)).toBeNull();
      expect(kv.getString(ONBOARDING_DRAFT_KEY)).toBeNull();
      expect(kv.getString('analytics.consent')).not.toBeNull();
      expect(getToken()).toBeNull();
    });
  });
});

describe('setToken() (UX-ACC-02)', () => {
  it('starts every sign-in from an empty cache, even if the last sign-out never ran', async () => {
    queryClient.setQueryData([['preferences', 'get']], { jobs: ['TRAIN'] });
    await setToken('token-b');
    expect(queryClient.getQueryData([['preferences', 'get']])).toBeUndefined();
    expect(getToken()).toBe('token-b');
  });
});
