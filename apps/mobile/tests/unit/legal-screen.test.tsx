import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import LegalDocScreen from '../../app/legal/[doc]';

// App Review R-01: the in-app legal view shows ONE page; every other link on
// it opens in the system browser.

let mockDoc = 'privacy';
let mockWebViewProps: Record<string, unknown> = {};

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ doc: mockDoc }),
}));
jest.mock('react-native-webview', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: { testID?: string }) => {
      mockWebViewProps = props;
      return <RN.View testID={props.testID} />;
    },
  };
});
jest.mock('../../src/lib/api-url', () => ({
  getWebUrl: (path: string) => `https://chefer.test${path}`,
}));

let openURLSpy: jest.SpyInstance;

beforeEach(() => {
  mockDoc = 'privacy';
  mockWebViewProps = {};
  openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

async function renderLegal() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LegalDocScreen />
    </SafeAreaProvider>,
  );
}

type Handler = (req: { url: string }) => boolean;

describe('LegalDocScreen web view', () => {
  it('loads the requested page and its anchors, nothing else', async () => {
    await renderLegal();
    expect(mockWebViewProps.source).toEqual({ uri: 'https://chefer.test/privacy' });
    const shouldLoad = mockWebViewProps.onShouldStartLoadWithRequest as Handler;
    expect(shouldLoad({ url: 'https://chefer.test/privacy' })).toBe(true);
    expect(shouldLoad({ url: 'https://chefer.test/privacy#analytics' })).toBe(true);
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it.each([
    'https://chefer.test/',
    'https://chefer.test/login',
    'https://chefer.test/support',
    'https://chefer.test/terms',
    'https://www.dataprotection.ro/',
    'mailto:support@chefer.test',
  ])('cancels %s and opens it externally', async (url) => {
    await renderLegal();
    const shouldLoad = mockWebViewProps.onShouldStartLoadWithRequest as Handler;
    expect(shouldLoad({ url })).toBe(false);
    expect(openURLSpy).toHaveBeenCalledWith(url);
  });

  it('shows a loading overlay until the page has loaded', async () => {
    await renderLegal();
    expect(screen.getByTestId('legal-loading')).toBeOnTheScreen();
    await act(() => {
      (mockWebViewProps.onLoadEnd as () => void)();
    });
    expect(screen.queryByTestId('legal-loading')).toBeNull();
  });

  it('shows an error with a retry when the page fails, and retry reloads', async () => {
    const user = userEvent.setup();
    await renderLegal();
    await act(() => {
      (mockWebViewProps.onError as () => void)();
    });
    expect(screen.getByTestId('legal-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-webview')).toBeNull();
    await user.press(screen.getByTestId('legal-retry'));
    expect(screen.getByTestId('legal-webview')).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-error')).toBeNull();
  });
});
