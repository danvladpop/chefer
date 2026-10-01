import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { Button } from '@chefer/ui-mobile';
import { PersonRow, personRowLabel } from '../../src/features/friends/components/person-row';
import { RequestRow } from '../../src/features/friends/components/request-row';
import { makeQueryClient, person, renderWithTrpc, SAFE_AREA_METRICS } from './friends-core-harness';

// PersonRow a11y (UX §3.2, §13): one element labelled `{name}, {secondary}`
// with the hint `Opens profile`, opening the profile; the trailing control is
// its own focus target and never opens the profile; a non-pressable row (Blocked
// people) is not a button; at ≥ 1.6× text the trailing control stacks.
// Plus RequestRow: Accept/Decline labelled with the name, optimistic removal.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const MARIA = person();

function renderRow(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('PersonRow', () => {
  it('is one button labelled `{name}, {secondary}` with the hint `Opens profile`', async () => {
    await renderRow(<PersonRow person={MARIA} secondary="Follows you" testID="row" />);
    const identity = screen.getByTestId('row-identity');
    expect(identity.props.accessibilityRole).toBe('button');
    expect(identity.props.accessibilityLabel).toBe('Maria Pop, Follows you');
    expect(identity.props.accessibilityHint).toBe('Opens profile');
    expect(screen.getByRole('button', { name: 'Maria Pop, Follows you' })).toBeTruthy();
    expect(personRowLabel('Maria Pop', null)).toBe('Maria Pop');
  });

  it('opens the profile', async () => {
    await renderRow(<PersonRow person={MARIA} testID="row" />);
    await userEvent.setup().press(screen.getByTestId('row-identity'));
    expect(router.push).toHaveBeenCalledWith(`/friends/${MARIA.id}`);
  });

  it('the trailing control is a separate focus target and does not open the profile', async () => {
    const onTrailing = jest.fn();
    await renderRow(
      <PersonRow
        person={MARIA}
        testID="row"
        trailing={
          <Button testID="trail" accessibilityLabel="Follow Maria Pop" onPress={onTrailing}>
            Follow
          </Button>
        }
      />,
    );
    // Not nested inside the row's accessible element.
    const identity = screen.getByTestId('row-identity');
    expect(within(identity).queryByTestId('trail')).toBeNull();
    await userEvent.setup().press(screen.getByTestId('trail'));
    expect(onTrailing).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a non-pressable row is labelled but not a button', async () => {
    await renderRow(<PersonRow person={MARIA} onPress={false} testID="row" />);
    const identity = screen.getByTestId('row-identity');
    expect(identity.props.accessibilityRole).toBeUndefined();
    expect(identity.props.accessibilityLabel).toBe('Maria Pop');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stacks the trailing control under the name at ≥ 1.6× text', async () => {
    jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.8 });
    await renderRow(<PersonRow person={MARIA} testID="row" trailing={<Button>Follow</Button>} />);
    expect(screen.getByTestId('row').props.className).toContain('flex-col');
  });
});

describe('RequestRow', () => {
  const REQUEST = person({ requestedYou: true });

  it('labels Accept/Decline with the name', async () => {
    await renderWithTrpc(<RequestRow person={REQUEST} via="home" testID="req" />, {});
    expect(screen.getByTestId('req-accept').props.accessibilityLabel).toBe('Accept Maria Pop');
    expect(screen.getByTestId('req-decline').props.accessibilityLabel).toBe('Decline Maria Pop');
  });

  it('accept leaves the requests list at once and offers Follow back', async () => {
    const qc = makeQueryClient();
    const key = [['friends', 'requests'], { input: {}, type: 'infinite' }];
    qc.setQueryData(key, { pages: [{ items: [REQUEST], nextCursor: null }], pageParams: [null] });
    const accept = jest.fn(() => ({ ok: true }));
    await renderWithTrpc(
      <RequestRow person={REQUEST} via="requests" testID="req" />,
      { 'friends.acceptRequest': accept, 'friends.me': () => null },
      qc,
    );
    await userEvent.setup().press(screen.getByTestId('req-accept'));
    expect(qc.getQueryData<{ pages: { items: unknown[] }[] }>(key)?.pages[0]?.items).toEqual([]);
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ userId: MARIA.id }));
    expect(await screen.findByText('Maria can now see your meals and workouts.')).toBeTruthy();
    expect(screen.getByText('Follow back')).toBeTruthy();
  });
});
