import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { COACHING_SHARING_COPY, type InvitePreviewDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import CoachingJoinRoute from '../../app/coaching/join/[code]';
import { renderWithTrpc } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// Lane K1: the client's "Share my food log" / "Share my weight" switches — off by default on the consent
// screen and sent with the join, then changeable (and revocable) in Your trainer.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ code: 'ABCD234567' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/auth-store', () => ({
  ...jest.requireActual<typeof import('../../src/lib/auth-store')>('../../src/lib/auth-store'),
  getToken: () => 'token',
  subscribe: () => () => undefined,
}));

const preview: InvitePreviewDto = {
  state: 'OK',
  trainerName: 'Ana',
  currentTrainerName: null,
  needsGymSetup: false,
};
/** RN's Switch carries `value` on iOS and `on` on Android (this file renders as Android). */
const isOn = (el: { props: { value?: unknown; on?: unknown } }) => el.props.value ?? el.props.on;

const coached = (food: boolean, weight: boolean) => ({
  trainer: {
    name: 'Ana',
    since: '2026-10-02T09:00:00.000Z',
    sharing: {
      food,
      weight,
      foodSince: food ? '2026-10-02T09:00:00.000Z' : null,
      weightSince: weight ? '2026-10-02T09:00:00.000Z' : null,
    },
  },
  stopped: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('consent screen sharing switches', () => {
  it('both start off; turning one on sends it with the join', async () => {
    const user = userEvent.setup();
    let joined: { share?: unknown } | null = null;
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview,
      'coaching.join': (input) => {
        joined = input as { share?: unknown };
        return coached(false, true);
      },
    });
    await settle();
    await screen.findByTestId('coaching-consent-share');
    expect(screen.getByText(COACHING_SHARING_COPY.food.body('Ana'))).toBeTruthy();
    expect(screen.getByText(COACHING_SHARING_COPY.footer)).toBeTruthy();
    expect(isOn(screen.getByTestId('coaching-consent-share-food'))).toBe(false);
    expect(isOn(screen.getByTestId('coaching-consent-share-weight'))).toBe(false);
    await fireEvent(screen.getByTestId('coaching-consent-share-weight'), 'valueChange', true);
    await user.press(screen.getByTestId('coaching-consent-allow'));
    await settle();
    expect(joined).toMatchObject({ share: { food: false, weight: true } });
  });
});
