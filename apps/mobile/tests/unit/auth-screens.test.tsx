import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../../app/(auth)/forgot-password';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import ResetPasswordScreen from '../../app/(auth)/reset-password';
import type { createTrpcAuthMock } from './auth-trpc-mock';
import { mutationResult } from './auth-trpc-mock';

// Audit P1-7 (auth parity): forgot/reset password (F-M-AUTH-3-1), register's
// confirm-password field, the Show/Hide password toggle, and every auth
// screen sitting in a KeyboardAwareScrollView (F-M-AUTH-2-1).
//
// The screens transitively import `../../src/lib/trpc` before this file's own
// mock import would run, so the factory has to `require()` lazily — same
// reasoning as onboarding-routing.test.tsx.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./auth-trpc-mock') as typeof import('./auth-trpc-mock');
  return mock.createTrpcAuthMock();
});
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      createElement(Pressable, { testID }, children),
  };
});
// Location defaults (P2-6): the device region is read through Intl; pin it.
let mockRegion: string | null = null;
jest.mock('@chefer/utils', () => ({
  ...jest.requireActual<typeof import('@chefer/utils')>('@chefer/utils'),
  detectRegion: () => mockRegion,
}));
jest.mock('../../src/lib/auth-store', () => ({
  setToken: jest.fn(() => Promise.resolve(undefined)),
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcAuthMock>>('../../src/lib/trpc');
const { router, useLocalSearchParams } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; back: jest.Mock; dismissTo: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

/** Wires `hook.useMutation` so `mutate` resolves straight into the screen's `onSuccess`. */
function mockMutation(hook: { useMutation: jest.Mock }, data: unknown = { success: true }) {
  const mutate = jest.fn();
  hook.useMutation.mockImplementation((opts?: { onSuccess?: (d: unknown) => unknown }) => {
    mutate.mockImplementation(() => void opts?.onSuccess?.(data));
    return mutationResult({ mutate });
  });
  return mutate;
}

beforeEach(() => {
  jest.clearAllMocks();
  useLocalSearchParams.mockReturnValue({});
  for (const hook of Object.values(trpc.auth)) hook.useMutation.mockReturnValue(mutationResult());
});

describe('Login', () => {
  it('sits in a keyboard-aware scroll view (F-M-AUTH-2-1)', async () => {
    await renderWithSafeArea(<LoginScreen />);
    // KeyboardAwareScrollView sets this on its inner ScrollView.
    expect(screen.getByTestId('login-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('opens the forgot-password screen', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);

    await user.press(screen.getByTestId('login-forgot-password'));

    expect(router.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('Show/Hide toggles the password between masked and plain text', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    const field = () => screen.getByTestId('login-password');

    expect(field().props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Show password')).toBeTruthy();

    await user.press(screen.getByTestId('login-password-toggle'));
    expect(field().props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Hide password')).toBeTruthy();

    await user.press(screen.getByTestId('login-password-toggle'));
    expect(field().props.secureTextEntry).toBe(true);
  });
});

describe('Register', () => {
  it('blocks submit when the passwords differ', async () => {
    const mutate = mockMutation(trpc.auth.register, { session: null });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password124!');
    await user.press(screen.getByTestId('register-submit'));

    expect(await screen.findByTestId('register-confirm-password-error')).toHaveTextContent(
      'Passwords do not match',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('requires the confirmation and never sends it to the API', async () => {
    const mutate = mockMutation(trpc.auth.register, { session: null });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.press(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-confirm-password-error')).toHaveTextContent(
      'Please confirm your password',
    );

    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    await user.press(screen.getByTestId('register-submit'));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        email: 'new@e2e.chefer.dev',
        password: 'Password123!',
      }),
    );
  });

  it('sends the device region so units + currency start local (P2-6)', async () => {
    mockRegion = 'US';
    const mutate = mockMutation(trpc.auth.register, { session: null });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    await user.press(screen.getByTestId('register-submit'));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        email: 'new@e2e.chefer.dev',
        password: 'Password123!',
        region: 'US',
      }),
    );
    mockRegion = null;
  });

  it('one toggle reveals both password fields; the confirm field has none of its own', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    expect(screen.queryByTestId('register-confirm-password-toggle')).toBeNull();
    await user.press(screen.getByTestId('register-password-toggle'));

    expect(screen.getByTestId('register-password').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('register-confirm-password').props.secureTextEntry).toBe(false);
  });

  it('sits in a keyboard-aware scroll view (F-M-AUTH-2-1)', async () => {
    await renderWithSafeArea(<RegisterScreen />);
    expect(screen.getByTestId('register-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('Forgot password', () => {
  it('validates the email before sending', async () => {
    const mutate = mockMutation(trpc.auth.requestPasswordReset);
    const user = userEvent.setup();
    await renderWithSafeArea(<ForgotPasswordScreen />);

    await user.type(screen.getByTestId('forgot-password-email'), 'not-an-email');
    await user.press(screen.getByTestId('forgot-password-submit'));

    expect(await screen.findByText('Invalid email address')).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('requests a reset link and shows the same confirmation for any address', async () => {
    const mutate = mockMutation(trpc.auth.requestPasswordReset);
    const user = userEvent.setup();
    await renderWithSafeArea(<ForgotPasswordScreen />);

    await user.type(screen.getByTestId('forgot-password-email'), 'alice@chefer.dev');
    await user.press(screen.getByTestId('forgot-password-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ email: 'alice@chefer.dev' }));
    expect(await screen.findByTestId('forgot-password-sent')).toHaveTextContent(
      /If an account exists for that address/,
    );
    expect(screen.queryByTestId('forgot-password-email')).toBeNull();
  });

  it('shows a server error (e.g. rate limited)', async () => {
    trpc.auth.requestPasswordReset.useMutation.mockReturnValue(
      mutationResult({ error: { message: 'Too many requests. Try again later.' } }),
    );
    await renderWithSafeArea(<ForgotPasswordScreen />);

    expect(screen.getByTestId('forgot-password-error')).toHaveTextContent(/Too many requests/);
  });

  it('goes back to sign in', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<ForgotPasswordScreen />);

    await user.press(screen.getByTestId('forgot-password-to-login'));

    expect(router.dismissTo).toHaveBeenCalledWith('/login');
  });

  it('sits in a keyboard-aware scroll view (F-M-AUTH-2-1)', async () => {
    await renderWithSafeArea(<ForgotPasswordScreen />);
    expect(screen.getByTestId('forgot-password-scroll').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );
  });
});

describe('Reset password', () => {
  it('without a token, points back to requesting a new link (like web)', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);

    expect(screen.getByTestId('reset-password-missing-token')).toBeTruthy();
    expect(screen.queryByTestId('reset-password-password')).toBeNull();

    await user.press(screen.getByTestId('reset-password-request-new'));
    expect(router.replace).toHaveBeenCalledWith('/forgot-password');
  });

  it('rejects a short password and a mismatched confirmation', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const mutate = mockMutation(trpc.auth.resetPassword);
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);

    await user.type(screen.getByTestId('reset-password-password'), 'short');
    await user.type(screen.getByTestId('reset-password-confirm'), 'shorter');
    await user.press(screen.getByTestId('reset-password-submit'));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
    expect(screen.getByTestId('reset-password-confirm-error')).toHaveTextContent(
      'Passwords do not match',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('resets with the deep-link token, then sends the user to sign in', async () => {
    useLocalSearchParams.mockReturnValue({ token: ' raw-token ' });
    const mutate = mockMutation(trpc.auth.resetPassword);
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);

    await user.type(screen.getByTestId('reset-password-password'), 'NewPass123!');
    await user.type(screen.getByTestId('reset-password-confirm'), 'NewPass123!');
    await user.press(screen.getByTestId('reset-password-submit'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ token: 'raw-token', password: 'NewPass123!' }),
    );
    expect(await screen.findByTestId('reset-password-done')).toHaveTextContent(
      /all devices signed out/,
    );

    await user.press(screen.getByTestId('reset-password-to-login'));
    expect(router.dismissTo).toHaveBeenCalledWith('/login');
  });

  it('takes the first token when the param is repeated', async () => {
    useLocalSearchParams.mockReturnValue({ token: ['first', 'second'] });
    const mutate = mockMutation(trpc.auth.resetPassword);
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);

    await user.type(screen.getByTestId('reset-password-password'), 'NewPass123!');
    await user.type(screen.getByTestId('reset-password-confirm'), 'NewPass123!');
    await user.press(screen.getByTestId('reset-password-submit'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ token: 'first', password: 'NewPass123!' }),
    );
  });

  it('shows an expired/invalid token error from the API', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    trpc.auth.resetPassword.useMutation.mockReturnValue(
      mutationResult({ error: { message: 'This reset link is invalid or has expired' } }),
    );
    await renderWithSafeArea(<ResetPasswordScreen />);

    expect(screen.getByTestId('reset-password-error')).toHaveTextContent(/invalid or has expired/);
  });

  it('sits in a keyboard-aware scroll view (F-M-AUTH-2-1)', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    await renderWithSafeArea(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-scroll').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );
  });
});
