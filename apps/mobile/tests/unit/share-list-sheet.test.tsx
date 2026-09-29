import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  DEFAULT_SHARE_PREFS,
  loadSharePrefs,
} from '../../src/features/shopping-list/share-list-prefs';
import { ShareListSheet } from '../../src/features/shopping-list/share-list-sheet';

// T-13.2 — `Send the list`: scope options with counts, remembered choice,
// dinners only when planned, RN core Share, and the confirmation snackbar.

const mockSnackbarShow = jest.fn();
const mockPlan = jest.fn<unknown, []>();

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});
jest.mock('../../src/lib/api-url', () => ({ getWebUrl: (p: string) => `https://chefer.test${p}` }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: { get: { useQuery: () => ({ data: undefined }) } },
    mealPlan: { getForWeek: { useQuery: () => mockPlan() } },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const items = [
  { key: 'a', ingredientName: 'Chicken breast', category: 'proteins', quantity: 500, unit: 'g' },
  { key: 'b', ingredientName: 'Spinach', category: 'produce', quantity: 200, unit: 'g' },
  { key: 'c', ingredientName: 'Tomatoes', category: 'produce', quantity: 4, unit: '' },
];

const renderSheet = (checkedKeys: string[], onClose = jest.fn()) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ShareListSheet
        visible
        onClose={onClose}
        weekOffset={0}
        weekStart={new Date(2026, 8, 28)}
        items={items}
        checkedKeys={checkedKeys}
      />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(undefined);
  mockPlan.mockReturnValue({ data: undefined });
});

describe('ShareListSheet', () => {
  it("offers What's left and Everything with counts once something is ticked", async () => {
    await renderSheet(['b']);
    expect(screen.getByText('Send the list')).toBeOnTheScreen();
    expect(screen.getByText('What’s left to buy · 2 items')).toBeOnTheScreen();
    expect(screen.getByText('Everything · 3 items')).toBeOnTheScreen();
    expect(screen.getByTestId('share-scope-left')).toBeChecked();
  });

  it('with nothing ticked there is one option, Everything', async () => {
    await renderSheet([]);
    expect(screen.getByText('Everything · 3 items')).toBeOnTheScreen();
    expect(screen.queryByTestId('share-scope-left')).toBeNull();
    expect(screen.getByTestId('share-scope-everything')).toBeChecked();
  });

  it('hides the dinners switch when no dinners are planned', async () => {
    await renderSheet(['b']);
    expect(screen.getByText('Include amounts')).toBeOnTheScreen();
    expect(screen.queryByTestId('share-dinners')).toBeNull();
  });

  it('remembers the choice per device', async () => {
    const user = userEvent.setup();
    await renderSheet(['b']);
    await user.press(screen.getByTestId('share-scope-everything'));
    expect(loadSharePrefs()).toEqual({ ...DEFAULT_SHARE_PREFS, scope: 'everything' });
  });

  it('Share… sends the built text through Share.share and confirms', async () => {
    const user = userEvent.setup();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    mockPlan.mockReturnValue({
      data: {
        days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipe: { name: 'Chicken Stir-fry' } }] }],
      },
    });
    const onClose = jest.fn();
    await renderSheet(['b'], onClose);
    await fireEvent(screen.getByTestId('share-dinners'), 'valueChange', true);
    await user.press(screen.getByText('Share…'));
    const message = share.mock.calls[0]?.[0]?.message ?? '';
    expect(message).toContain('Shopping list · 28 Sep – 4 Oct');
    expect(message).toContain('For 1 dinner');
    expect(message).toContain('- Tomatoes, 4');
    expect(message).not.toContain('Spinach');
    expect(message).toContain('Mon: Chicken Stir-fry');
    expect(message).toContain('Made with Chefer · https://chefer.test/');
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'List ready to send.' }),
    );
    expect(onClose).toHaveBeenCalled();
    share.mockRestore();
  });
});
