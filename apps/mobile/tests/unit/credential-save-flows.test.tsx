import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import { saveCredentials } from '../../src/features/auth/save-credentials';
import { AccountV4 } from '../../src/features/onboarding-v4/account-v4';
import type { createTrpcAuthMock } from './auth-trpc-mock';
import { mutationResult } from './auth-trpc-mock';

// F8: the explicit password-manager save (docs/research/password-autofill.md
// §10) runs exactly once after an email sign-up or a TYPED sign-in succeeds —
// never after a failure, and never for a sign-in the password manager filled
// (that credential is already saved).
jest.mock('../../src/features/auth/save-credentials', () => ({
  saveCredentials: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference imports
  const mock = require('./auth-trpc-mock') as typeof import('./auth-trpc-mock');
  return mock.createTrpcAuthMock();
});
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference imports
  const { createElement, useEffect } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    useFocusEffect: (effect: () => (() => void) | undefined): void => {
      useEffect(effect, [effect]);
    },
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      createElement(Pressable, { testID }, children),
  };
});
jest.mock('../../src/lib/auth-store', () => ({
  setToken: jest.fn(() => Promise.resolve(undefined)),
  getToken: jest.fn(() => null),
  subscribe: jest.fn(() => () => undefined),
  loadToken: jest.fn(() => Promise.resolve(null)),
  hasSignedInBefore: jest.fn(() => true),
  loadHasSignedInBefore: jest.fn(() => Promise.resolve(true)),
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcAuthMock>>('../../src/lib/trpc');
const save = saveCredentials as jest.Mock;

const EMAIL = 'ana@example.com';
const PASSWORD = 'Password123!';

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

type Outcome = 'success' | 'failure';

/** `mutate` settles straight into the screen's own onSuccess / onError. */
function settleMutation(hook: { useMutation: jest.Mock }, outcome: Outcome) {
  const mutate = jest.fn();
  hook.useMutation.mockImplementation(
    (opts?: {
      onSuccess?: (data: unknown, variables: unknown) => unknown;
      onError?: (e: unknown) => unknown;
    }) => {
      mutate.mockImplementation((variables: unknown) => {
        if (outcome === 'success') void opts?.onSuccess?.({ session: { token: 't' } }, variables);
        else void opts?.onError?.(new Error('Invalid email or password'));
      });
      return mutationResult({ mutate });
    },
  );
  return mutate;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const hook of Object.values(trpc.auth)) {
    if (jest.isMockFunction(hook.useMutation)) hook.useMutation.mockReturnValue(mutationResult());
  }
});

describe('Sign in', () => {
  it('a typed sign-in that succeeds offers the credential once', async () => {
    const mutate = settleMutation(trpc.auth.login, 'success');
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), EMAIL);
    await user.type(screen.getByTestId('login-password'), PASSWORD);
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it('a failed sign-in offers nothing', async () => {
    const mutate = settleMutation(trpc.auth.login, 'failure');
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), EMAIL);
    await user.type(screen.getByTestId('login-password'), PASSWORD);
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it('a password the password manager filled in one go is already saved: offers nothing', async () => {
    const mutate = settleMutation(trpc.auth.login, 'success');
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    // AutoFill / Google Autofill set each field's whole value in one change.
    await fireEvent.changeText(screen.getByTestId('login-email'), EMAIL);
    await fireEvent.changeText(screen.getByTestId('login-password'), PASSWORD);
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it('a filled password the user then edits by hand is a typed one', async () => {
    const mutate = settleMutation(trpc.auth.login, 'success');
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-email'), EMAIL);
    await fireEvent.changeText(screen.getByTestId('login-password'), 'Password123');
    await user.type(screen.getByTestId('login-password'), '!');
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledWith(EMAIL, PASSWORD));
  });
  it('one typed character, then the password manager replaces it: offers nothing', async () => {
    const mutate = settleMutation(trpc.auth.login, 'success');
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), EMAIL);
    await user.type(screen.getByTestId('login-password'), 'x');
    // Google's suggestion replaces the field's text with the saved password.
    await fireEvent.changeText(screen.getByTestId('login-password'), PASSWORD);
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it('a wrong typed password, then a password-manager fill: offers nothing', async () => {
    const outcomes: Outcome[] = ['failure', 'success'];
    const mutate = jest.fn();
    trpc.auth.login.useMutation.mockImplementation(
      (opts: {
        onSuccess: (data: unknown, variables: unknown) => unknown;
        onError: (e: unknown) => unknown;
      }) => {
        mutate.mockImplementation((variables: unknown) => {
          if (outcomes.shift() === 'success')
            void opts.onSuccess({ session: { token: 't' } }, variables);
          else void opts.onError(new Error('Invalid email or password'));
        });
        return mutationResult({ mutate });
      },
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), EMAIL);
    await user.type(screen.getByTestId('login-password'), 'wrong-guess');
    await user.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));

    // The screen cleared the wrong password; AutoFill now fills the saved one.
    await fireEvent.changeText(screen.getByTestId('login-password'), PASSWORD);
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Sign up (V3 register screen)', () => {
  async function fillAndSubmit() {
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);
    await user.type(screen.getByTestId('register-email'), EMAIL);
    await user.type(screen.getByTestId('register-password'), PASSWORD);
    await user.type(screen.getByTestId('register-confirm-password'), PASSWORD);
    await user.press(screen.getByTestId('register-accept-terms'));
    await user.press(screen.getByTestId('register-age-confirm'));
    await user.press(screen.getByTestId('register-submit'));
  }

  it('a new account offers its credential once', async () => {
    const mutate = settleMutation(trpc.auth.register, 'success');
    await fillAndSubmit();

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it('a failed sign-up offers nothing', async () => {
    const mutate = settleMutation(trpc.auth.register, 'failure');
    await fillAndSubmit();

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Sign up (Onboarding V4 account step)', () => {
  async function fillAndSubmit({ filled }: { filled: boolean }) {
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);
    await user.type(screen.getByTestId('register-email'), EMAIL);
    if (filled) {
      // iOS "Use Strong Password" fills both fields at once.
      await fireEvent.changeText(screen.getByTestId('register-password'), PASSWORD);
      await fireEvent.changeText(screen.getByTestId('register-confirm-password'), PASSWORD);
    } else {
      await user.type(screen.getByTestId('register-password'), PASSWORD);
      await user.type(screen.getByTestId('register-confirm-password'), PASSWORD);
    }
    await user.press(screen.getByTestId('register-v4-agree'));
    await user.press(screen.getByTestId('register-submit'));
  }

  it('a new account offers its credential once', async () => {
    const mutate = settleMutation(trpc.auth.register, 'success');
    await fillAndSubmit({ filled: false });

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it('a suggested strong password is new too: handed over once (iOS saves it itself; no module there)', async () => {
    const mutate = settleMutation(trpc.auth.register, 'success');
    await fillAndSubmit({ filled: true });

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('a failed sign-up offers nothing', async () => {
    const mutate = settleMutation(trpc.auth.register, 'failure');
    await fillAndSubmit({ filled: false });

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });
});
