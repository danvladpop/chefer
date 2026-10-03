import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { RecipePickerSheet } from '../../src/features/meal-plan/recipe-picker-sheet';
import { ConsentHistory } from '../../src/features/privacy/consent-history';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-X-12: a failed load must not read as an empty one — consent history
// ("Nothing recorded yet") and the Replace picker ("No recipes match").

jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  AiConsentHost: () => null,
}));

const serverDown = () => {
  throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
};

describe('Consent history: failed load', () => {
  it('shows an error with Try again, not "Nothing recorded yet"', async () => {
    let up = false;
    const user = userEvent.setup();
    await renderWithTrpc(
      <ConsentHistory />,
      {
        'privacy.getConsentHistory': () =>
          up
            ? [
                {
                  id: 'c1',
                  kind: 'TERMS',
                  granted: true,
                  providers: [],
                  documentVersion: '2',
                  createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
                },
              ]
            : serverDown(),
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('consent-history-error')).toBeOnTheScreen());
    expect(screen.queryByText('Nothing recorded yet.')).toBeNull();
    up = true;
    await user.press(screen.getByTestId('consent-history-error-retry'));
    expect(await screen.findByText(/Terms accepted/)).toBeOnTheScreen();
  });

  it('a genuinely empty history still says so', async () => {
    await renderWithTrpc(
      <ConsentHistory />,
      { 'privacy.getConsentHistory': () => [] },
      testQueryClient(),
    );
    expect(await screen.findByText('Nothing recorded yet.')).toBeOnTheScreen();
  });
});

describe('Replace picker: failed load', () => {
  const sheet = (
    <RecipePickerSheet
      visible
      mealName="Dinner"
      busy={false}
      error={null}
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />
  );

  it('shows an error with Try again, not "No recipes match your search."', async () => {
    let up = false;
    const user = userEvent.setup();
    await renderWithTrpc(
      sheet,
      {
        'recipe.list': () =>
          up
            ? [
                {
                  id: 'r1',
                  name: 'Lentil Curry',
                  imageUrl: null,
                  mealType: 'dinner',
                  nutritionInfo: { calories: 400 },
                  nutritionStatus: 'COMPUTED',
                  prepTimeMins: 10,
                  cookTimeMins: 20,
                },
              ]
            : serverDown(),
        'recipe.listHiddenCount': () => ({ hidden: 0 }),
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('picker-load-error')).toBeOnTheScreen());
    expect(screen.queryByText('No recipes match your search.')).toBeNull();
    up = true;
    await user.press(screen.getByTestId('picker-load-error-retry'));
    await waitFor(() => expect(screen.queryByTestId('picker-load-error')).toBeNull());
  });
});
