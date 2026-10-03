import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  ACCOUNT_EXISTS_MESSAGE,
  authEmailSchema,
  loginFormSchema,
  RESET_LINK_INVALID_MESSAGE,
} from '@chefer/types';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import ResetPasswordScreen from '../../app/(auth)/reset-password';
import { clearEmailHint, setEmailHint } from '../../src/features/auth/email-hint';
import { newPasswordFieldProps } from '../../src/features/auth/password-fields';
import { clearRegisterDraft } from '../../src/features/auth/register-draft';
import type { createTrpcAuthMock } from './auth-trpc-mock';
import { mutationResult } from './auth-trpc-mock';

// WP-09 lane B: UX-ACC-07 (trimmed email), -08 (password managers), -09 (reset
// dead end + login reset on focus), -15 (account exists), -16 (stale mismatch),
// -18 (double submit). Same harness as auth-screens.test.tsx.
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
const { router, useLocalSearchParams } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; dismissTo: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

type Handlers = { onError?: (e: unknown) => void; onSuccess?: (d: unknown) => unknown };
/** Mutation whose options are captured, so a test can fire onError/onSuccess itself. */
function captureMutation(
  hook: { useMutation: jest.Mock },
  overrides: Record<string, unknown> = {},
) {
  const mutate = jest.fn();
  const reset = jest.fn();
  const handlers: Handlers = {};
  hook.useMutation.mockImplementation((opts: Handlers) => {
    handlers.onError = opts.onError;
    handlers.onSuccess = opts.onSuccess;
    return mutationResult({ mutate, reset, ...overrides });
  });
  return { mutate, reset, handlers };
}

async function checkConsentBoxes(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByTestId('register-accept-terms'));
  await user.press(screen.getByTestId('register-age-confirm'));
}

beforeEach(() => {
  jest.clearAllMocks();
  useLocalSearchParams.mockReturnValue({});
  for (const hook of Object.values(trpc.auth)) hook.useMutation.mockReturnValue(mutationResult());
  clearRegisterDraft();
  clearEmailHint();
});

describe('shared email schema (UX-ACC-07)', () => {
  it('trims a trailing space instead of calling the address invalid', () => {
    expect(authEmailSchema.parse('ana@example.com ')).toBe('ana@example.com');
    expect(loginFormSchema.parse({ email: ' ana@example.com\n', password: 'x' }).email).toBe(
      'ana@example.com',
    );
    expect(authEmailSchema.safeParse('   ').success).toBe(false);
    expect(authEmailSchema.safeParse('not an email').success).toBe(false);
  });
});

describe('password manager props (UX-ACC-08)', () => {
  it('real builds declare a new password; only the development variant opts out', () => {
    expect(newPasswordFieldProps('production')).toEqual({
      autoComplete: 'new-password',
      textContentType: 'newPassword',
    });
    expect(newPasswordFieldProps(undefined).textContentType).toBe('newPassword');
    expect(newPasswordFieldProps('development').textContentType).toBe('oneTimeCode');
  });

  it('Register and Reset password fields use newPassword outside E2E builds', async () => {
    const { unmount } = await renderWithSafeArea(<RegisterScreen />);
    expect(screen.getByTestId('register-password').props.textContentType).toBe('newPassword');
    expect(screen.getByTestId('register-confirm-password').props.textContentType).toBe(
      'newPassword',
    );
    await unmount();

    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    await renderWithSafeArea(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-password').props.textContentType).toBe('newPassword');
  });
});

describe('Login', () => {
  it('submits a trailing-space email trimmed (UX-ACC-07)', async () => {
    const { mutate } = captureMutation(trpc.auth.login);
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);

    await user.type(screen.getByTestId('login-email'), 'ana@example.com ');
    await user.type(screen.getByTestId('login-password'), 'Password123!');
    await user.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Password123!' }),
    );
  });

  it('clears the old server error when the user edits a field (UX-ACC-07)', async () => {
    const error = Object.assign(new Error('Invalid email or password'), {
      name: 'TRPCClientError',
      data: { code: 'UNAUTHORIZED' },
    });
    const { reset } = captureMutation(trpc.auth.login, { error });
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    reset.mockClear(); // the focus effect resets once on mount

    await user.type(screen.getByTestId('login-email'), 'a');

    expect(reset).toHaveBeenCalled();
  });

  it('empties the password after a failed sign-in (UX-ACC-08)', async () => {
    const { handlers } = captureMutation(trpc.auth.login);
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);
    await user.type(screen.getByTestId('login-email'), 'ana@example.com');
    await user.type(screen.getByTestId('login-password'), 'wrong-password');

    await act(async () => handlers.onError?.(new Error('Invalid email or password')));

    expect(screen.getByTestId('login-password').props.value).toBe('');
    expect(screen.getByTestId('login-email').props.value).toBe('ana@example.com');
  });

  it('ignores a second submit while the first is in flight (UX-ACC-18)', async () => {
    const { mutate } = captureMutation(trpc.auth.login, { isPending: true });
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);

    expect(screen.getByTestId('login-email').props.editable).toBe(false);
    expect(screen.getByTestId('login-password').props.editable).toBe(false);
    await user.type(screen.getByTestId('login-email'), 'ana@example.com');
    await user.type(screen.getByTestId('login-password'), 'Password123!');
    await user.press(screen.getByTestId('login-submit'));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('prefills the email handed over by another auth screen, with an empty password (UX-ACC-09)', async () => {
    setEmailHint('ana@example.com');
    await renderWithSafeArea(<LoginScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('login-email').props.value).toBe('ana@example.com'),
    );
    expect(screen.getByTestId('login-password').props.value).toBe('');
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
  });
});

describe('Register', () => {
  const existsError = Object.assign(new Error(ACCOUNT_EXISTS_MESSAGE), {
    name: 'TRPCClientError',
    data: { code: 'CONFLICT', httpStatus: 409 },
  });

  it('offers Sign in and Reset when the account already exists (UX-ACC-15)', async () => {
    captureMutation(trpc.auth.register, { error: existsError });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);
    await user.type(screen.getByTestId('register-email'), 'ana@example.com');

    expect(screen.getByTestId('register-error')).toHaveTextContent(ACCOUNT_EXISTS_MESSAGE);
    await user.press(screen.getByTestId('register-exists-sign-in'));
    expect(router.dismissTo).toHaveBeenCalledWith('/login');

    await user.press(screen.getByTestId('register-exists-reset'));
    expect(router.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('shows no Sign in / Reset links for other errors', async () => {
    captureMutation(trpc.auth.register, { error: new Error('Something else') });
    await renderWithSafeArea(<RegisterScreen />);

    expect(screen.queryByTestId('register-exists-sign-in')).toBeNull();
  });

  it('clears the "already exists" error as soon as the email changes (UX-ACC-15)', async () => {
    const { reset } = captureMutation(trpc.auth.register, { error: existsError });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'b');

    expect(reset).toHaveBeenCalled();
  });

  it('submits a trailing-space email trimmed (UX-ACC-07)', async () => {
    const { mutate } = captureMutation(trpc.auth.register);
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev ');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    await checkConsentBoxes(user);
    await user.press(screen.getByTestId('register-submit'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@e2e.chefer.dev', password: 'Password123!' }),
      ),
    );
  });

  it('drops "Passwords do not match" once the confirmation is corrected (UX-ACC-16)', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);
    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password124!');
    await checkConsentBoxes(user);
    await user.press(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-confirm-password-error')).toHaveTextContent(
      'Passwords do not match',
    );

    // Fix the PASSWORD (not the confirmation): the two now match.
    await user.clear(screen.getByTestId('register-password'));
    await user.type(screen.getByTestId('register-password'), 'Password124!');

    await waitFor(() => expect(screen.queryByTestId('register-confirm-password-error')).toBeNull());
  });

  it('ignores a second submit while the first is in flight (UX-ACC-18)', async () => {
    const { mutate } = captureMutation(trpc.auth.register, { isPending: true });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    expect(screen.getByTestId('register-email').props.editable).toBe(false);
    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    await checkConsentBoxes(user);
    await user.press(screen.getByTestId('register-submit'));

    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('Reset password', () => {
  it('swaps the form for the request-a-new-link card when the link is dead (UX-ACC-09)', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const { handlers } = captureMutation(trpc.auth.resetPassword);
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-title')).toHaveTextContent('Choose a new password');

    const error = Object.assign(new Error(RESET_LINK_INVALID_MESSAGE), {
      name: 'TRPCClientError',
      data: { code: 'BAD_REQUEST' },
    });
    await act(async () => handlers.onError?.(error));

    expect(screen.getByTestId('reset-password-missing-token')).toHaveTextContent(
      /invalid or has expired/,
    );
    expect(screen.queryByTestId('reset-password-password')).toBeNull();
    expect(screen.getByTestId('reset-password-title')).toHaveTextContent(/no longer works/);
    await user.press(screen.getByTestId('reset-password-request-new'));
    expect(router.replace).toHaveBeenCalledWith('/forgot-password');
  });

  it('keeps the form for any other error', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const { handlers } = captureMutation(trpc.auth.resetPassword);
    await renderWithSafeArea(<ResetPasswordScreen />);

    await act(async () => handlers.onError?.(new Error('Too many requests')));

    expect(screen.getByTestId('reset-password-password')).toBeTruthy();
  });

  it('retitles the screen once the password is changed (UX-ACC-09)', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const { handlers } = captureMutation(trpc.auth.resetPassword);
    await renderWithSafeArea(<ResetPasswordScreen />);

    await act(async () => handlers.onSuccess?.({ success: true }));

    expect(screen.getByTestId('reset-password-title')).toHaveTextContent('Password changed');
    expect(screen.getByTestId('reset-password-done')).toBeTruthy();
  });

  it('drops "Passwords do not match" once the password is corrected (UX-ACC-16)', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);
    await user.type(screen.getByTestId('reset-password-password'), 'NewPass123!');
    await user.type(screen.getByTestId('reset-password-confirm'), 'NewPass124!');
    await user.press(screen.getByTestId('reset-password-submit'));
    expect(await screen.findByTestId('reset-password-confirm-error')).toBeTruthy();

    await user.clear(screen.getByTestId('reset-password-password'));
    await user.type(screen.getByTestId('reset-password-password'), 'NewPass124!');

    await waitFor(() => expect(screen.queryByTestId('reset-password-confirm-error')).toBeNull());
  });

  it('ignores a second submit while the first is in flight (UX-ACC-18)', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'raw-token' });
    const { mutate } = captureMutation(trpc.auth.resetPassword, { isPending: true });
    const user = userEvent.setup();
    await renderWithSafeArea(<ResetPasswordScreen />);
    await user.type(screen.getByTestId('reset-password-password'), 'NewPass123!');
    await user.type(screen.getByTestId('reset-password-confirm'), 'NewPass123!');
    await user.press(screen.getByTestId('reset-password-submit'));

    expect(mutate).not.toHaveBeenCalled();
  });
});
