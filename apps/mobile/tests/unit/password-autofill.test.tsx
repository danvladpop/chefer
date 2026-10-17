import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import { AccountV4 } from '../../src/features/onboarding-v4/account-v4';
import type { createTrpcAuthMock } from './auth-trpc-mock';
import { mutationResult } from './auth-trpc-mock';

// F8 (owner feedback 2026-10-17): iOS suggested a strong password at sign-up
// but never offered to save it. Apple's contract
// (docs/research/password-autofill.md): the account field is tagged
// `username` (email keyboard kept), new-password fields — confirm included —
// `newPassword`, the sign-in password `password`.
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

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const hook of Object.values(trpc.auth)) {
    if (jest.isMockFunction(hook.useMutation)) hook.useMutation.mockReturnValue(mutationResult());
  }
});

function expectAccountField(testID: string) {
  const { props } = screen.getByTestId(testID);
  expect(props.textContentType).toBe('username');
  expect(props.autoComplete).toBe('username');
  expect(props.keyboardType).toBe('email-address');
}

describe('Password AutoFill field tags (F8)', () => {
  it('V4 sign-up: email is the username, both password fields are new passwords', async () => {
    await renderWithSafeArea(<AccountV4 />);
    expectAccountField('register-email');
    expect(screen.getByTestId('register-password').props.textContentType).toBe('newPassword');
    expect(screen.getByTestId('register-confirm-password').props.textContentType).toBe(
      'newPassword',
    );
  });

  it('V3 sign-up: email is the username', async () => {
    await renderWithSafeArea(<RegisterScreen />);
    expectAccountField('register-email');
  });

  it('sign-in: email is the username, the password is the saved one', async () => {
    await renderWithSafeArea(<LoginScreen />);
    expectAccountField('login-email');
    expect(screen.getByTestId('login-password').props.textContentType).toBe('password');
  });
});

// F9: the V4 sign-up (prod's live path) gets a "Confirm password" field that
// iOS's suggested strong password fills too.
describe('V4 sign-up confirm password (F9)', () => {
  function mockRegister() {
    const mutate = jest.fn();
    trpc.auth.register.useMutation.mockReturnValue(mutationResult({ mutate }));
    return mutate;
  }

  async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirm: string) {
    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), password);
    if (confirm) await user.type(screen.getByTestId('register-confirm-password'), confirm);
    await user.press(screen.getByTestId('register-v4-agree'));
  }

  it('blocks the submit and says so when the passwords differ', async () => {
    const mutate = mockRegister();
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);

    await fill(user, 'Password123!', 'Password124!');
    await user.press(screen.getByTestId('register-submit'));

    expect(await screen.findByTestId('register-confirm-password-error')).toHaveTextContent(
      'Passwords do not match',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('asks for the confirmation, then registers without sending it', async () => {
    const mutate = mockRegister();
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);

    await fill(user, 'Password123!', '');
    await user.press(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-confirm-password-error')).toHaveTextContent(
      'Please confirm your password',
    );
    expect(mutate).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    expect(screen.queryByTestId('register-confirm-password-error')).toBeNull();
    await user.press(screen.getByTestId('register-submit'));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@e2e.chefer.dev',
          password: 'Password123!',
          acceptedTerms: true,
          ageConfirmed: true,
          acceptedTermsVersion: CURRENT_TERMS_VERSION,
        }),
      ),
    );
    const [input] = mutate.mock.calls[0] as [Record<string, unknown>];
    expect(input).not.toHaveProperty('confirmPassword');
  });

  it('drops "Passwords do not match" as soon as the password is corrected', async () => {
    mockRegister();
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);

    await fill(user, 'Password123', 'Password123!');
    await user.press(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-confirm-password-error')).toBeTruthy();

    await user.type(screen.getByTestId('register-password'), '!');
    expect(screen.queryByTestId('register-confirm-password-error')).toBeNull();
  });

  it('one Show toggle reveals both fields; the confirm field has none of its own', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);

    expect(screen.queryByTestId('register-confirm-password-toggle')).toBeNull();
    expect(screen.getByTestId('register-confirm-password').props.secureTextEntry).toBe(true);
    await user.press(screen.getByTestId('register-password-toggle'));

    expect(screen.getByTestId('register-password').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('register-confirm-password').props.secureTextEntry).toBe(false);
  });

  it('clears a server error as soon as the confirmation is edited (UX-ACC-15)', async () => {
    const reset = jest.fn();
    const serverError = Object.assign(new Error('An account with this email already exists'), {
      name: 'TRPCClientError',
      data: { code: 'CONFLICT', httpStatus: 409 },
    });
    trpc.auth.register.useMutation.mockReturnValue(mutationResult({ error: serverError, reset }));
    const user = userEvent.setup();
    await renderWithSafeArea(<AccountV4 />);

    await user.type(screen.getByTestId('register-confirm-password'), 'x');

    expect(reset).toHaveBeenCalled();
  });
});
