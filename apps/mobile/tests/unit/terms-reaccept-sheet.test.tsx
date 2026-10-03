import { Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { TermsReacceptSheet } from '../../src/features/auth/terms-reaccept-sheet';

// The re-accept sheet is a Modal: its Terms / Privacy links close it, open the
// in-app legal page once it is gone (never the system browser), and bring it
// back when the reader returns.

const mockPush = jest.fn();
let mockPathname = '/';

jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => {
      mockPush(href);
    },
  },
  usePathname: () => mockPathname,
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    privacy: {
      getConsentHistory: {
        useQuery: () => ({ data: [{ kind: 'TERMS', documentVersion: '2000-01-01' }] }),
      },
      acceptTerms: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const ui = () => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <TermsReacceptSheet signedIn />
  </SafeAreaProvider>
);

beforeAll(() => {
  // Android path of the kit Sheet: onExited fires when the Modal unmounts.
  jest.replaceProperty(Platform, 'OS', 'android');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
});

describe('TermsReacceptSheet legal links', () => {
  it('Terms closes the sheet then opens /legal/terms in the app, and the sheet returns after', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const user = userEvent.setup();
    const { rerender } = await render(ui());
    expect(screen.getByTestId('terms-reaccept-agree')).toBeTruthy();

    await user.press(screen.getByText('Terms'));
    expect(screen.queryByTestId('terms-reaccept-agree')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
    expect(openURL).not.toHaveBeenCalled();

    // On the legal page the sheet stays out of the way ...
    mockPathname = '/legal/terms';
    await rerender(ui());
    expect(screen.queryByTestId('terms-reaccept-agree')).toBeNull();
    // ... and is back (not dismissed) once the reader returns.
    mockPathname = '/';
    await act(async () => {
      await rerender(ui());
    });
    expect(screen.getByTestId('terms-reaccept-agree')).toBeTruthy();
  });

  it('Privacy Policy opens /legal/privacy', async () => {
    const user = userEvent.setup();
    await render(ui());
    await user.press(screen.getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
  });
});
