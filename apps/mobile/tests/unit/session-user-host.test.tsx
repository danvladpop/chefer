import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';

// SessionUserHost is the one place sign-in, sign-out and switching accounts
// reach crash reporting and usage analytics. These tests render it with a
// controllable `user.me` and assert what a caller can observe: the account
// id each side is given, and that the launch's `app_opened` waits until the
// account is known, so a linked user's launch carries their id.

let mockMe: { data: { id: string } | undefined; isError: boolean } = {
  data: undefined,
  isError: false,
};
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    user: {
      me: {
        useQuery: (_input: undefined, opts: { enabled: boolean }) =>
          opts.enabled ? mockMe : { data: undefined, isError: false },
      },
    },
  },
}));

const mockCrashUser = jest.fn<undefined, [string | null]>();
jest.mock('../../src/lib/crash-reporting', () => ({
  setCrashReportingUser: (id: string | null) => {
    mockCrashUser(id);
  },
}));

const mockLog: string[] = [];
jest.mock('../../src/lib/analytics', () => ({
  setCurrentUserId: (id: string | null) => mockLog.push(`user:${id}`),
}));
jest.mock('../../src/lib/app-open-tracking', () => ({
  trackLaunchOpen: () => mockLog.push('launch-open'),
  noteAppStateForOpens: (status: string) => mockLog.push(`app-state:${status}`),
}));

// Required after the mocks above are registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionUserHost } = require('../../src/components/session-user-host') as {
  SessionUserHost: (props: { signedIn: boolean }) => null;
};

let appStateListener: ((status: AppStateStatus) => void) | null = null;
const removeListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  mockLog.length = 0;
  mockCrashUser.mockClear();
  removeListener.mockClear();
  mockMe = { data: undefined, isError: false };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: removeListener };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('SessionUserHost', () => {
  it('signed in: waits for user.me, then gives the id to both sides BEFORE the launch open', async () => {
    const view = await render(<SessionUserHost signedIn />);
    expect(mockLog).toEqual(['user:null']);

    mockMe = { data: { id: 'user-1' }, isError: false };
    await view.rerender(<SessionUserHost signedIn />);

    expect(mockLog).toEqual(['user:null', 'user:user-1', 'launch-open']);
    expect(mockCrashUser).toHaveBeenLastCalledWith('user-1');
  });

  it('signed out: the launch open goes out at once, with no account id', async () => {
    await render(<SessionUserHost signedIn={false} />);
    expect(mockLog).toEqual(['user:null', 'launch-open']);
  });

  it('sign-out clears the id; signing in as another account sets the new one', async () => {
    mockMe = { data: { id: 'user-a' }, isError: false };
    const view = await render(<SessionUserHost signedIn />);
    await view.rerender(<SessionUserHost signedIn={false} />);
    mockMe = { data: { id: 'user-b' }, isError: false };
    await view.rerender(<SessionUserHost signedIn />);

    expect(mockLog.filter((l) => l.startsWith('user:'))).toEqual([
      'user:user-a',
      'user:null',
      'user:user-b',
    ]);
    expect(mockCrashUser.mock.calls.map(([id]) => id)).toEqual(['user-a', null, 'user-b']);
  });

  it('user.me failing still lets the launch open go out', async () => {
    mockMe = { data: undefined, isError: true };
    await render(<SessionUserHost signedIn />);
    expect(mockLog).toEqual(['user:null', 'launch-open']);
  });

  it('offline (user.me paused, never answering): the launch open goes out after 5 s', async () => {
    await render(<SessionUserHost signedIn />);
    expect(mockLog).not.toContain('launch-open');

    await act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockLog).toContain('launch-open');
  });

  it('passes AppState changes on for resume opens, and stops listening on unmount', async () => {
    const view = await render(<SessionUserHost signedIn={false} />);
    appStateListener?.('background');
    appStateListener?.('active');
    expect(mockLog).toEqual([
      'user:null',
      'launch-open',
      'app-state:background',
      'app-state:active',
    ]);

    await view.unmount();
    expect(removeListener).toHaveBeenCalled();
  });
});
