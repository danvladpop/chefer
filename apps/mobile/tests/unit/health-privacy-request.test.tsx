import { renderHook } from '@testing-library/react-native';
import { useHealthPrivacyRequests } from '../../src/features/health/health-privacy-request';

// C2 / Play Health Connect policy: tapping "privacy policy" in Health Connect's
// permission screen opens Chefer's in-app Privacy Policy.

let mockPending = false;
let mockHasModule = true;
jest.mock('expo', () => ({
  requireOptionalNativeModule: () =>
    mockHasModule
      ? {
          consumePrivacyRequest: () => {
            const pending = mockPending;
            mockPending = false;
            return pending;
          },
        }
      : null,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  usePathname: () => '/home',
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  mockPending = false;
  mockHasModule = true;
});

describe('useHealthPrivacyRequests', () => {
  it('opens the Privacy Policy once for a Health Connect request', async () => {
    mockPending = true;
    const { rerender } = await renderHook(() => useHealthPrivacyRequests());
    await rerender({});
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/legal/privacy');
  });

  it('does nothing without a request, or on a binary without the module', async () => {
    await renderHook(() => useHealthPrivacyRequests());
    mockHasModule = false;
    mockPending = true;
    await renderHook(() => useHealthPrivacyRequests());
    expect(router.push).not.toHaveBeenCalled();
  });
});
