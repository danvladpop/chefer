import { render } from '@testing-library/react-native';
import {
  getReturnAfterSignIn,
  setReturnAfterSignIn,
} from '../../src/features/coaching/pending-join';
import { PendingJoinHost } from '../../src/features/coaching/pending-join-host';

// WP-18 lane D: "sign in, then come back to the invite" (spec §2.3 step 1). Only a code remembered while
// signed out brings the person back; gym setup's carry-on never does.

let mockPathname = '/';
let mockOnboarding = false;
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  usePathname: () => mockPathname,
}));
jest.mock('../../src/features/auth/pending-onboarding', () => ({
  usePendingOnboarding: () => mockOnboarding,
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
  mockOnboarding = false;
  setReturnAfterSignIn(null);
});

describe('PendingJoinHost', () => {
  it('signed in with a remembered invite: opens it once', async () => {
    setReturnAfterSignIn('ABCD234567');
    const view = await render(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
    expect(getReturnAfterSignIn()).toBeNull();
    await view.rerender(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('signed out: waits', async () => {
    setReturnAfterSignIn('ABCD234567');
    await render(<PendingJoinHost signedIn={false} />);
    expect(router.push).not.toHaveBeenCalled();
    expect(getReturnAfterSignIn()).toBe('ABCD234567');
  });

  it('a new account finishes onboarding first', async () => {
    setReturnAfterSignIn('ABCD234567');
    mockOnboarding = true;
    const view = await render(<PendingJoinHost signedIn />);
    expect(router.push).not.toHaveBeenCalled();
    mockOnboarding = false;
    mockPathname = '/onboarding';
    await view.rerender(<PendingJoinHost signedIn />);
    expect(router.push).not.toHaveBeenCalled();
    mockPathname = '/';
    await view.rerender(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
  });

  it('the invite is already on screen (it re-rendered signed in): nothing to open', async () => {
    setReturnAfterSignIn('ABCD234567');
    mockPathname = '/coaching/join/ABCD234567';
    await render(<PendingJoinHost signedIn />);
    expect(router.push).not.toHaveBeenCalled();
    expect(getReturnAfterSignIn()).toBeNull();
  });

  it('nothing remembered (gym-setup carry-on only): never navigates', async () => {
    await render(<PendingJoinHost signedIn />);
    expect(router.push).not.toHaveBeenCalled();
  });
});
