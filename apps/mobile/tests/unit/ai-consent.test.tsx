import { Platform, Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { notifyAiConsentRequired } from '@chefer/utils';
import {
  AiConsentHost,
  AiConsentProvider,
  useAiConsent,
} from '../../src/features/ai-consent/ai-consent-provider';

// App Store 5.1.2(i): before the first AI action the consent sheet asks;
// "Not now" sends nothing, "Allow" records consent and then runs the action
// (after the sheet is fully dismissed, so a camera can present next).

let mockUser: { aiDataConsentAt: Date | null } | undefined;
let mockProviders: { primary: string; backups: string[] } | undefined;
const mockGrant = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => {
      mockPush(href);
    },
  },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: {
        me: {
          setData: jest.fn(),
          fetch: () => Promise.resolve(mockUser),
        },
      },
    }),
    profile: {
      aiProviders: { useQuery: () => ({ data: mockProviders }) },
    },
    user: {
      me: { useQuery: () => ({ data: mockUser }) },
      grantAiDataConsent: {
        useMutation: () => ({
          mutate: (_input: undefined, opts?: { onSuccess?: () => void }) => {
            mockGrant();
            opts?.onSuccess?.();
          },
          reset: jest.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const action = jest.fn();
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function AiButton({ usesAi }: { usesAi?: boolean }) {
  const requestAiConsent = useAiConsent();
  return (
    <Pressable
      testID="ai-action"
      onPress={() =>
        requestAiConsent('meal-scan', action, usesAi === undefined ? undefined : { usesAi })
      }
    >
      <Text>Scan</Text>
    </Pressable>
  );
}

async function renderGate(usesAi?: boolean) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AiConsentProvider signedIn>
        <AiButton {...(usesAi !== undefined && { usesAi })} />
        <AiConsentHost />
      </AiConsentProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { aiDataConsentAt: null };
  mockProviders = undefined;
});

// The sheet reports "fully gone" through Modal.onDismiss on iOS, which the
// test renderer never fires; Android's path (Modal unmounted) is the one a
// test can observe, so the gate runs as on Android here.
beforeAll(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('AI data consent gate', () => {
  it('R-10: when the server refuses an AI action for missing consent the sheet reopens with that feature’s copy', async () => {
    // A stale cache: the client thinks consent is on record.
    mockUser = { aiDataConsentAt: new Date() };
    await renderGate();
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();

    await act(() => {
      notifyAiConsentRequired('ingredient-estimate');
    });

    expect(screen.getByTestId('ai-consent-allow')).toBeTruthy();
    expect(screen.getByText('The ingredient name you typed')).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    // "Allow" records consent and runs nothing (the original action is unknown).
    await userEvent.setup().press(screen.getByTestId('ai-consent-allow'));
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  // The consent sheet is a Modal: a pushed route would open behind it, so the
  // Privacy link closes the sheet first and opens the in-app page once it is
  // gone. It counts as "Not now": nothing is sent, the action is dropped.
  it('Privacy link closes the sheet, then opens Privacy in the app (no browser)', async () => {
    const user = userEvent.setup();
    await renderGate();
    await user.press(screen.getByTestId('ai-action'));
    await user.press(screen.getByTestId('ai-consent-privacy'));
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('runs straight away when consent is on record', async () => {
    mockUser = { aiDataConsentAt: new Date() };
    const user = userEvent.setup();
    await renderGate();

    await user.press(screen.getByTestId('ai-action'));

    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();
  });

  it('never asks for an action that does not use AI', async () => {
    const user = userEvent.setup();
    await renderGate(false);

    await user.press(screen.getByTestId('ai-action'));

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('asks first, naming the provider and what is sent', async () => {
    const user = userEvent.setup();
    await renderGate();

    await user.press(screen.getByTestId('ai-action'));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/sends some of your data to Groq/)).toBeTruthy();
    expect(screen.getByText('The photo you take or choose')).toBeTruthy();
    expect(screen.getByText(/not used to train/)).toBeTruthy();
  });

  it('R-10: before the provider list loads (or when it fails) it names Groq + Cloudflare, never the legacy Gemini', async () => {
    mockProviders = undefined;
    await renderGate();
    await userEvent.setup().press(screen.getByTestId('ai-action'));
    expect(screen.getByText(/sends some of your data to Groq/)).toBeTruthy();
    expect(screen.getByText(/handled by Cloudflare Workers AI/)).toBeTruthy();
    expect(screen.queryByText(/Gemini/)).toBeNull();
  });

  it('names Groq and Cloudflare, never Gemini, when the server runs free-only', async () => {
    mockProviders = { primary: 'groq', backups: ['cloudflare'] };
    await renderGate();
    await userEvent.setup().press(screen.getByTestId('ai-action'));
    expect(screen.getByText(/sends some of your data to Groq/)).toBeTruthy();
    expect(screen.getByText(/handled by Cloudflare Workers AI/)).toBeTruthy();
    expect(screen.queryByText(/Gemini/)).toBeNull();
  });

  it('"Not now" sends nothing and records nothing', async () => {
    const user = userEvent.setup();
    await renderGate();

    await user.press(screen.getByTestId('ai-action'));
    await user.press(screen.getByTestId('ai-consent-not-now'));

    expect(mockGrant).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  it('"Allow" records consent, then runs the action once the sheet is gone', async () => {
    const user = userEvent.setup();
    await renderGate();

    await user.press(screen.getByTestId('ai-action'));
    await user.press(screen.getByTestId('ai-consent-allow'));

    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();
  });
});
