import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen } from '@testing-library/react-native';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  adjustRest,
  nextRestAnnouncement,
  resetRestTimerForTests,
  skipRest,
  startRest,
  syncNotification,
} from '../../src/features/gym/rest-timer';
import { ResumeCard } from '../../src/features/gym/today/resume-card';
import { RestTimerBar } from '../../src/features/gym/workout/rest-timer-bar';
import { makeBootstrap } from './gym-fixtures';
import { activeDoc } from './gym-workout-helpers';

// WP-12 lane A — UX-GYM-09 / UX-GYM-10: the "Rest is over" alert is scheduled
// the moment a rest STARTS (not when the app later backgrounds), the countdown
// shows on the Resume card, and a screen reader hears start / 10 s / end only.

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock<Promise<string>, [ScheduledArg]>;
  cancelScheduledNotificationAsync: jest.Mock;
}>('expo-notifications');

type ScheduledArg = { trigger: { date: number }; content: { title: string } };

const NOW = new Date(2026, 8, 28, 12, 0, 0);
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let nextId = 0;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  setKvBackendForTests(createMemoryKvBackend());
  resetRestTimerForTests();
  nextId = 0;
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  Notifications.scheduleNotificationAsync.mockImplementation(() => Promise.resolve(`n${++nextId}`));
  Notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

describe('rest notification is scheduled at rest START (UX-GYM-09 / UX-GYM-10)', () => {
  it('schedules for endsAt as soon as the rest starts — no backgrounding needed', async () => {
    startRest(90, 'se-1');
    await syncNotification();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [arg] = Notifications.scheduleNotificationAsync.mock.calls[0] ?? [];
    if (!arg) throw new Error('nothing scheduled');
    expect(arg.content.title).toBe('Rest is over');
    expect(arg.trigger.date).toBe(NOW.getTime() + 90_000);
  });

  it('re-schedules on ±15 s (cancelling the old alert) and never schedules the same end twice', async () => {
    startRest(90, 'se-1');
    await syncNotification();
    await syncNotification(); // same end instant → no duplicate
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    adjustRest(15);
    await syncNotification();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const [second] = Notifications.scheduleNotificationAsync.mock.calls[1] ?? [];
    expect(second?.trigger.date).toBe(NOW.getTime() + 105_000);
  });

  it('skip cancels the alert', async () => {
    startRest(90, 'se-1');
    await syncNotification();
    skipRest();
    await syncNotification();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  });

  it('a quick start → +15 s → skip leaves nothing scheduled and no stray alert', async () => {
    startRest(90, 'se-1');
    adjustRest(15);
    skipRest();
    await syncNotification();
    // Reconciles read the CURRENT rest when they run: with it cleared, nothing is scheduled.
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never prompts or schedules when notifications are not allowed', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    startRest(90, 'se-1');
    await syncNotification();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('nextRestAnnouncement (UX-GYM-09: TalkBack hears start, 10 s and end only)', () => {
  it('speaks once at start, once at 10 s, and is silent in between', () => {
    let stage = nextRestAnnouncement('idle', 90);
    expect(stage.message).toBe('Rest started, 90 seconds');
    const spoken: string[] = [];
    for (let left = 89; left >= 1; left--) {
      const next = nextRestAnnouncement(stage.stage, left);
      stage = next;
      if (next.message) spoken.push(next.message);
    }
    expect(spoken).toEqual(['10 seconds left']);
  });

  it('re-arms the 10 s warning when +15 s pushes the rest back above it', () => {
    let s = nextRestAnnouncement('idle', 30);
    s = nextRestAnnouncement(s.stage, 10);
    expect(s.message).toBe('10 seconds left');
    s = nextRestAnnouncement(s.stage, 25); // +15 s
    expect(s.message).toBeNull();
    s = nextRestAnnouncement(s.stage, 10);
    expect(s.message).toBe('10 seconds left');
  });

  it('a rest shorter than the warning does not announce twice', () => {
    const start = nextRestAnnouncement('idle', 8);
    expect(start.message).toBe('Rest started, 8 seconds');
    expect(nextRestAnnouncement(start.stage, 7).message).toBeNull();
  });
});

describe('RestTimerBar announcements', () => {
  it('announces start, 10 s and end — and the ticking text is not a live region', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <RestTimerBar />
      </SafeAreaProvider>,
    );
    await act(() => {
      startRest(15, 'se-1');
    });
    expect(
      screen.getByTestId('rest-timer-remaining').props.accessibilityLiveRegion,
    ).toBeUndefined();
    expect(announce).toHaveBeenCalledWith('Rest started, 15 seconds');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_500);
    });
    expect(announce).toHaveBeenCalledWith('10 seconds left');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(announce).toHaveBeenCalledWith('Rest is over');
    // start + 10 s + end = three announcements for a 15 s rest, not ~15.
    expect(announce).toHaveBeenCalledTimes(3);
  });
});

describe('Resume card shows the rest countdown (UX-GYM-09)', () => {
  it('shows Rest m:ss while a rest is running and hides it afterwards', async () => {
    const session = { ...activeDoc(), localDate: localDate() };
    await render(<ResumeCard bootstrap={makeBootstrap()} session={session} pausedAt={null} />);
    expect(screen.queryByTestId('gym-today-resume-rest')).not.toBeOnTheScreen();

    await act(() => {
      startRest(90, 'se-1');
    });
    expect(screen.getByTestId('gym-today-resume-rest')).toHaveTextContent('Rest 1:30');
    // Not a live region: a screen reader reads it on focus, not every second.
    expect(
      screen.getByTestId('gym-today-resume-rest').props.accessibilityLiveRegion,
    ).toBeUndefined();

    await act(() => {
      skipRest();
    });
    expect(screen.queryByTestId('gym-today-resume-rest')).not.toBeOnTheScreen();
  });
});
