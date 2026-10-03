import { screen, userEvent, waitFor } from '@testing-library/react-native';
import SettingsJobsScreen from '../../app/settings/jobs';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-X-12: Settings › "What you use Chefer for" used to spin forever when
// the preferences could not be loaded.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));

describe('Settings › jobs: failed load', () => {
  it('shows an error with Try again, and the screen loads once the server is back', async () => {
    let up = false;
    const user = userEvent.setup();
    await renderWithTrpc(
      <SettingsJobsScreen />,
      {
        'preferences.get': () => {
          if (!up) throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
          return { chefProfile: null, dietaryPreferences: null, jobs: ['PLAN_MEALS'] };
        },
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('settings-jobs-load-error')).toBeOnTheScreen());
    up = true;
    await user.press(screen.getByTestId('settings-jobs-load-error-retry'));
    expect(await screen.findByTestId('settings-jobs-title')).toBeOnTheScreen();
  });
});
