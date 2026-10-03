import { Keyboard, type TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Input } from '@chefer/ui-mobile';
import { AccountDataCard } from '../../src/features/profile/account-data-card';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// T-39.5 (bug B-53): a real, named export file (`chefer-export-YYYY-MM-DD.json`)
// shared through shareExportFile, confirmed with the "Your export is ready."
// snackbar — not an unnamed text blob in the share sheet.

const mockShareExportFile = jest.fn(
  (_filename: string, _contents: string): Promise<boolean | undefined> =>
    Promise.resolve(undefined),
);
const mockShow = jest.fn();
const mockExportFetch = jest.fn(() => Promise.resolve({ user: { id: 'u1' } }));
const mockDeleteMutate = jest.fn();
const mockResetMutate = jest.fn();
let mockResetState: { isSuccess: boolean; isPending: boolean } = {
  isSuccess: false,
  isPending: false,
};

// The wrapper (not a direct reference) is deliberate: jest.mock() factories
// run at first `require`, which happens at import time — BEFORE this file's
// own `const mockShareExportFile = …` has executed. Calling through a lazy
// arrow defers reading `mockShareExportFile` until the mocked function is
// actually invoked, by which point it's initialized.
jest.mock('../../src/lib/share-file', () => ({
  shareExportFile: (filename: string, contents: string) => mockShareExportFile(filename, contents),
}));

jest.mock('@chefer/ui-mobile', () => ({
  ...jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile'),
  useSnackbar: () => ({ show: mockShow }),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

// UX-ACC-12: deletion leaves through the one sign-out (cache, gym data,
// reminders, drafts, token) — covered in sign-out.test.ts.
const mockSignOut = jest.fn((_options?: { reason?: string }) => Promise.resolve());
jest.mock('../../src/lib/sign-out', () => ({
  signOut: (options?: { reason?: string }) => mockSignOut(options),
}));
let mockDeleteOptions: { onSuccess?: () => Promise<void>; onError?: () => void } | undefined;
let mockDeleteState: { isError: boolean; error: Error | null } = { isError: false, error: null };
const mockDeleteReset = jest.fn();
const mockMarkAccountDeleted = jest.fn();
jest.mock('../../src/features/auth/account-deleted-notice', () => ({
  markAccountDeleted: () => mockMarkAccountDeleted(),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: mockExportFetch } } }),
    user: {
      deleteSelf: {
        useMutation: (options?: { onSuccess?: () => Promise<void>; onError?: () => void }) => {
          mockDeleteOptions = options;
          return {
            mutate: mockDeleteMutate,
            reset: mockDeleteReset,
            isPending: false,
            ...mockDeleteState,
          };
        },
      },
    },
    auth: {
      me: { useQuery: () => ({ data: { email: 'alice@chefer.dev' } }) },
      requestPasswordReset: {
        useMutation: () => ({ mutate: mockResetMutate, isError: false, ...mockResetState }),
      },
    },
  },
}));

let queryClient: QueryClient;

beforeEach(() => {
  mockShareExportFile.mockClear();
  mockShow.mockClear();
  mockExportFetch.mockClear();
  mockDeleteMutate.mockClear();
  mockSignOut.mockClear();
  mockResetMutate.mockClear();
  mockMarkAccountDeleted.mockClear();
  mockDeleteReset.mockClear();
  mockDeleteState = { isError: false, error: null };
  mockResetState = { isSuccess: false, isPending: false };
  queryClient = new QueryClient();
});

function renderCard() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <AccountDataCard />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('mobile AccountDataCard export (T-39.5)', () => {
  it('shares a file named chefer-export-YYYY-MM-DD.json and shows the ready snackbar', async () => {
    await renderCard();

    await fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() => expect(mockShareExportFile).toHaveBeenCalledTimes(1));
    const [filename] = mockShareExportFile.mock.calls.at(0) ?? [];
    expect(filename).toMatch(/^chefer-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mockShow).toHaveBeenCalledWith({ message: 'Your export is ready.', tone: 'success' });
  });

  it('UX-ACC-22: a cancelled share sheet gets no "ready" snackbar and no error', async () => {
    mockShareExportFile.mockResolvedValueOnce(false);
    await renderCard();

    await fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() => expect(mockShareExportFile).toHaveBeenCalledTimes(1));
    expect(mockShow).not.toHaveBeenCalled();
    expect(screen.queryByText(/Couldn't prepare your data/)).toBeNull();
  });

  it('shows an error and no snackbar when the export fetch fails', async () => {
    mockExportFetch.mockRejectedValueOnce(new Error('network'));
    await renderCard();

    await fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't prepare your data. Please try again.")).toBeTruthy(),
    );
    expect(mockShow).not.toHaveBeenCalled();
  });
});

describe('mobile DeleteAccountSheet (App Review R-03 / R-17 / R-24)', () => {
  async function openSheet() {
    await renderCard();
    await fireEvent.press(screen.getByTestId('profile-delete-account'));
  }

  it('R-03: the footer sits in a keyboard-persisting scroll view and deletes on the first press', async () => {
    await openSheet();
    expect(screen.getByTestId('delete-account-footer').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );

    await fireEvent.changeText(screen.getByTestId('delete-account-password'), 'Secret1!');
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'delete');
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));

    expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
    expect(mockDeleteMutate).toHaveBeenCalledWith({ password: 'Secret1!', confirm: 'DELETE' });
  });

  it('UX-ACC-26: with the keyboard up, the first press on Cancel closes the sheet', async () => {
    await openSheet();
    // The password keyboard is up: Cancel lives in the persist-taps footer, so
    // the tap reaches the button instead of only dismissing the keyboard.
    await fireEvent(screen.getByTestId('delete-account-password'), 'focus');
    expect(screen.getByTestId('delete-account-footer').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );
    await fireEvent.changeText(screen.getByTestId('delete-account-password'), 'Secret1!');
    await fireEvent.press(screen.getByTestId('delete-account-cancel'));
    await waitFor(() => expect(screen.queryByTestId('delete-account-password')).toBeNull());
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('UX-ACC-26: the DELETE field scrolls itself clear of the keyboard inside the sheet', async () => {
    // Every `Input` measures itself against the sheet body on focus; spy on the
    // mock TextInput prototype to see it (a bare TextInput would not).
    const holder: { node: TextInput | null } = { node: null };
    await render(
      <Input
        ref={(n) => {
          holder.node = n;
        }}
      />,
    );
    const proto = Object.getPrototypeOf(holder.node) as TextInput;
    const measure = jest.spyOn(proto, 'measureLayout').mockImplementation(() => undefined);
    await openSheet();
    await fireEvent(screen.getByTestId('delete-account-confirm-text'), 'focus');
    expect(measure).toHaveBeenCalled();
    measure.mockRestore();
  });

  it('UX-ACC-12: a deleted account leaves through signOut() and lands on the auth screen', async () => {
    const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');
    router.replace.mockClear();
    await renderCard();
    await mockDeleteOptions?.onSuccess?.();
    expect(mockSignOut).toHaveBeenCalledWith({ reason: 'account-deleted' });
    expect(router.replace).toHaveBeenCalledWith('/(auth)');
  });

  it('UX-ACC-11: a wrong password shows its error right under the password field and refocuses it', async () => {
    mockDeleteState = { isError: true, error: new Error('Incorrect password') };
    const holder: { node: TextInput | null } = { node: null };
    await render(
      <Input
        ref={(n) => {
          holder.node = n;
        }}
      />,
    );
    const proto = Object.getPrototypeOf(holder.node) as TextInput;
    const focus = jest.spyOn(proto, 'focus').mockImplementation(() => undefined);
    await openSheet();
    await mockDeleteOptions?.onError?.();

    expect(screen.getByTestId('delete-account-error')).toHaveTextContent('Incorrect password');
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it('UX-ACC-11: editing the password clears the stale error', async () => {
    mockDeleteState = { isError: true, error: new Error('Incorrect password') };
    await openSheet();
    await fireEvent.changeText(screen.getByTestId('delete-account-password'), 'x');
    expect(mockDeleteReset).toHaveBeenCalled();
  });

  it('UX-ACC-11: marks the one-time "deleted" notice before signing out', async () => {
    await renderCard();
    await mockDeleteOptions?.onSuccess?.();
    expect(mockMarkAccountDeleted).toHaveBeenCalledTimes(1);
  });

  it('R-03: the DELETE field shows Done and dismisses the keyboard on submit', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await openSheet();
    const field = screen.getByTestId('delete-account-confirm-text');
    expect(field.props.returnKeyType).toBe('done');
    await fireEvent(field, 'submitEditing');
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('R-03: typing DELETE closes the keyboard so the button is one tap away', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await openSheet();
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'DELET');
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'DELETE');
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('R-17: pressing delete sends the typed password and empties the field', async () => {
    await openSheet();
    await fireEvent.changeText(screen.getByTestId('delete-account-password'), 'Secret1!');
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'DELETE');
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));
    expect(mockDeleteMutate).toHaveBeenCalledWith({ password: 'Secret1!', confirm: 'DELETE' });
    expect(screen.getByTestId('delete-account-password').props.value).toBe('');
  });

  it('R-17: the password field opts out of the iOS save-password prompt', async () => {
    await openSheet();
    const field = screen.getByTestId('delete-account-password');
    expect(field.props.autoComplete).toBe('off');
    expect(field.props.textContentType).toBe('oneTimeCode');
    expect(field.props.secureTextEntry).toBe(true);
  });

  it('R-24: "Forgot your password?" requests a reset link for the signed-in email', async () => {
    await openSheet();
    await fireEvent.press(screen.getByTestId('delete-account-forgot-password'));
    expect(mockResetMutate).toHaveBeenCalledWith({ email: 'alice@chefer.dev' });
  });

  it('R-24: confirms where the link was sent', async () => {
    mockResetState = { isSuccess: true, isPending: false };
    await openSheet();
    expect(screen.getByTestId('delete-account-reset-sent')).toHaveTextContent(
      /We sent a reset link to alice@chefer\.dev/,
    );
    expect(screen.queryByTestId('delete-account-forgot-password')).toBeNull();
  });
});
