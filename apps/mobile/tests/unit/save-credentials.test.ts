import { requireOptionalNativeModule } from 'expo';
import { saveCredentials } from '../../src/features/auth/save-credentials';

// F8: the explicit "save this password?" hand-off to Android's Credential
// Manager through the local `chefer-credentials` Expo module. A binary without
// the module (1.0.1, and every iOS build) must run the same JS as a no-op, and
// nothing it does may surface to the user — the account already exists.
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const requireModule = requireOptionalNativeModule as jest.Mock;

function installModule(savePassword: jest.Mock) {
  requireModule.mockImplementation((name: string) =>
    name === 'CheferCredentials' ? { savePassword } : null,
  );
}

beforeEach(() => {
  requireModule.mockReset();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

it('hands the trimmed email and the password to the native module', async () => {
  const savePassword = jest.fn(() => Promise.resolve('saved'));
  installModule(savePassword);

  await saveCredentials('  ana@example.com ', 'Password123!');

  expect(savePassword).toHaveBeenCalledTimes(1);
  expect(savePassword).toHaveBeenCalledWith('ana@example.com', 'Password123!');
});

it('is a no-op on a binary without the module (1.0.1)', async () => {
  requireModule.mockReturnValue(null);

  await expect(saveCredentials('ana@example.com', 'Password123!')).resolves.toBeUndefined();
});

it('swallows a native failure or a cancel, logging it without the password', async () => {
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  installModule(jest.fn(() => Promise.reject(new Error('CreateCredentialCancellationException'))));

  await expect(saveCredentials('ana@example.com', 'Password123!')).resolves.toBeUndefined();

  expect(info).toHaveBeenCalled();
  expect(JSON.stringify(info.mock.calls)).not.toContain('Password123!');
});
