import { Platform } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { FriendProfileDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { isFriendsQueryKey } from '../../src/features/friends/api/query-keys';
import { FriendProfileScreen } from '../../src/features/friends/profile/profile-screen';
import { isGymQueryKey } from '../../src/features/gym/offline/query-persistence';
import {
  availableHandlers,
  deferred,
  meDto,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';
import {
  CAROL,
  CAROL_ID,
  lockedProfile,
  profileDto,
  recipeCard,
  routineDto,
  testQueryClient,
  weekDto,
  workoutsDto,
} from './friends-profile-fixtures';

// The profile screen (UX §8, PRD E7 / FR-14): states, locked panels, the
// own-profile preview, the overflow, and the two binding rules — the
// Food|Gym switch is local (never `setMode`, plan §15) and friend data never
// lands under a `gym` query key (INV-7).

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: {
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    },
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    useFocusEffect: () => undefined,
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/gym/mode-store', () => ({
  getMode: jest.fn(() => 'food'),
  setMode: jest.fn(),
}));

const { router } = jest.requireMock<{ router: Record<string, jest.Mock> }>('expo-router');
const modeStore = jest.requireMock<{ getMode: jest.Mock; setMode: jest.Mock }>(
  '../../src/features/gym/mode-store',
);

function handlers(profile: FriendProfileDto | (() => unknown), extra: Handlers = {}): Handlers {
  return {
    ...availableHandlers(),
    'friends.profile': typeof profile === 'function' ? profile : () => profile,
    'friends.week': () => weekDto(),
    'friends.recipes': () => ({ items: [recipeCard()], nextCursor: null }),
    'friends.routine': () => routineDto(),
    'friends.workouts': () => workoutsDto(),
    'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC' } }),
    ...extra,
  };
}

async function renderProfile(h: Handlers) {
  return renderWithTrpc(<FriendProfileScreen userId={CAROL_ID} />, h, testQueryClient());
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  modeStore.getMode.mockReturnValue('food');
  // Android path of the kit Sheet: onExited fires when the Modal unmounts.
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('profile states (UX §8.2)', () => {
  it('shows the skeleton while the profile loads', async () => {
    const pending = deferred<FriendProfileDto>();
    await renderProfile(handlers(() => pending.promise));
    expect(await screen.findByTestId('friends-profile-loading')).toBeTruthy();
    pending.resolve(profileDto());
    expect(await screen.findByTestId('friends-profile-header-name')).toBeTruthy();
  });

  it('NOT_FOUND → `Profile not available` with Go back, no hint why', async () => {
    await renderProfile(
      handlers(() => {
        throw trpcError('NOT_FOUND', 404, {}, 'Profile not available');
      }),
    );
    expect(await screen.findByText('Profile not available')).toBeTruthy();
    expect(screen.getByText('This profile doesn’t exist or isn’t available to you.')).toBeTruthy();
    await userEvent.setup().press(screen.getByText('Go back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('another error → `Couldn’t load this profile.` with a retry', async () => {
    let calls = 0;
    await renderProfile(
      handlers(() => {
        calls += 1;
        if (calls === 1) throw trpcError('INTERNAL_SERVER_ERROR', 500);
        return profileDto();
      }),
    );
    expect(await screen.findByText('Couldn’t load this profile.')).toBeTruthy();
  });

  it('a viewer who has not turned Following on is sent to the intro', async () => {
    await renderProfile(
      handlers(() => {
        throw trpcError('PRECONDITION_FAILED', 412, { friendsNotActivated: true });
      }),
    );
    expect((await screen.findByTestId('redirect')).props.children).toBe('/friends');
  });

  it('a private non-follower sees the header and `This profile is private` — no content queried', async () => {
    const r = await renderProfile(handlers(lockedProfile({ visibility: 'PRIVATE' })));
    expect(await screen.findByText('This profile is private')).toBeTruthy();
    expect(screen.getByText('Follow Carol to see their meals and workouts.')).toBeTruthy();
    expect(screen.getByText('Carol Reyes')).toBeTruthy();
    expect(screen.getByText('24 followers · 31 following')).toBeTruthy();
    expect(screen.getByTestId('profile-mode-food')).toBeTruthy();
    // Both tabs show the same panel.
    await userEvent.setup().press(screen.getByTestId('profile-mode-gym'));
    expect(await screen.findByText('This profile is private')).toBeTruthy();
    for (const p of ['friends.week', 'friends.recipes', 'friends.routine', 'friends.workouts']) {
      expect(r.paths()).not.toContain(p);
    }
  });

  it('after requesting: `Request sent`', async () => {
    await renderProfile(
      handlers(lockedProfile({ visibility: 'PRIVATE', user: { ...CAROL, relation: 'requested' } })),
    );
    expect(await screen.findByText('Request sent')).toBeTruthy();
    expect(
      screen.getByText('You’ll see their meals and workouts once Carol accepts.'),
    ).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
  });

  it('a public non-follower: body only, and `Follow` on the button', async () => {
    await renderProfile(handlers(lockedProfile({ visibility: 'PUBLIC' })));
    expect(await screen.findByText('Follow Carol to see their meals and workouts.')).toBeTruthy();
    expect(screen.queryByText('This profile is private')).toBeNull();
    expect(screen.getByText('Follow')).toBeTruthy();
  });

  it('a section that isn’t shared shows its line in that tab', async () => {
    await renderProfile(
      handlers(
        profileDto({ access: { plan: 'not_shared', recipes: 'visible', workouts: 'not_shared' } }),
      ),
    );
    expect(await screen.findByText('Carol isn’t sharing their meal plan')).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId('profile-mode-gym'));
    expect(await screen.findByText('Carol isn’t sharing their workouts')).toBeTruthy();
  });

  it('`Follows you` shows only when they follow me', async () => {
    await renderProfile(handlers(profileDto({ user: { ...CAROL, followsYou: true } })));
    expect(await screen.findByText('Follows you')).toBeTruthy();
  });
});

describe('own profile preview (UX §8.3)', () => {
  const self = profileDto({
    isSelf: true,
    visibility: 'PRIVATE',
    user: { ...CAROL, relation: 'self' },
  });

  it('shows the banner, the visibility badge and `Edit sharing`, and no overflow', async () => {
    await renderProfile(handlers(self));
    expect(await screen.findByText('This is what your followers see.')).toBeTruthy();
    expect(screen.getByText('Private')).toBeTruthy();
    expect(screen.getByText('Edit sharing')).toBeTruthy();
    expect(screen.queryByTestId('friends-profile-overflow')).toBeNull();
  });

  it('an unshared section reads `Hidden from followers`; forced private says why', async () => {
    const me = meDto({
      settings: {
        visibility: 'PRIVATE',
        forcedPrivate: true,
        sharePlan: false,
        shareRecipes: true,
        shareWorkouts: true,
        shareTargets: false,
      },
    });
    await renderProfile({ ...handlers(self), ...availableHandlers(me) });
    expect(await screen.findByText('Hidden from followers')).toBeTruthy();
    expect(
      await screen.findByText('Your profile is private because several people reported it.'),
    ).toBeTruthy();
  });
});

describe('Food | Gym switch (FR-14.4)', () => {
  it('opens on the viewer’s app mode and never writes it back', async () => {
    modeStore.getMode.mockReturnValue('gym');
    await renderProfile(handlers(profileDto()));
    expect(await screen.findByText('Push Pull Legs')).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('profile-mode-food'));
    expect(await screen.findByText('Greek yogurt bowl')).toBeTruthy();
    await user.press(screen.getByTestId('profile-mode-gym'));
    expect(await screen.findByText('Push Pull Legs')).toBeTruthy();
    expect(modeStore.setMode).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('INV-7: friend data never under a gym key', () => {
  it('rendering both tabs creates no gym.* query and calls no gym.* procedure', async () => {
    const r = await renderProfile(handlers(profileDto()));
    expect(await screen.findByText('Greek yogurt bowl')).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-food-recipes'));
    expect(await screen.findByText('Shakshuka')).toBeTruthy();
    await user.press(screen.getByTestId('profile-mode-gym'));
    expect(await screen.findByText('Push Pull Legs')).toBeTruthy();
    await waitFor(() => expect(r.paths()).toContain('friends.workouts'));

    const keys = r.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys.some((k) => isGymQueryKey(k))).toBe(false);
    expect(r.paths().some((p) => p.startsWith('gym.'))).toBe(false);
    for (const p of ['friends.week', 'friends.recipes', 'friends.routine', 'friends.workouts']) {
      expect(r.paths()).toContain(p);
    }
    expect(keys.filter((k) => isFriendsQueryKey(k)).length).toBeGreaterThanOrEqual(6);
  });
});

describe('overflow (UX §8.1, §11.4)', () => {
  it('offers Report and block + Block, but no Remove follower when they don’t follow me', async () => {
    const user = userEvent.setup();
    await renderProfile(handlers(profileDto()));
    await user.press(await screen.findByTestId('friends-profile-overflow'));
    expect(await screen.findByText('Report and block Carol')).toBeTruthy();
    expect(screen.getByText('Block Carol')).toBeTruthy();
    expect(screen.queryByText('Remove follower')).toBeNull();
  });

  it('offers Remove follower when they follow me', async () => {
    const user = userEvent.setup();
    await renderProfile(handlers(profileDto({ user: { ...CAROL, followsYou: true } })));
    await user.press(await screen.findByTestId('friends-profile-overflow'));
    expect(await screen.findByText('Remove follower')).toBeTruthy();
  });

  it('Report and block opens the ReportSheet only after the menu has closed', async () => {
    const user = userEvent.setup();
    await renderProfile(handlers(profileDto()));
    await user.press(await screen.findByTestId('friends-profile-overflow'));
    await user.press(screen.getByText('Report and block Carol'));
    expect(await screen.findByText('Report Carol')).toBeTruthy();
    expect(screen.queryByText('Report and block Carol')).toBeNull();
  });

  it('a successful block backs out of the profile', async () => {
    const user = userEvent.setup();
    await renderProfile(handlers(profileDto(), { 'friends.block': () => ({ ok: true }) }));
    await user.press(await screen.findByTestId('friends-profile-overflow'));
    await user.press(screen.getByText('Block Carol'));
    await user.press(await screen.findByTestId('friends-profile-block-confirm'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await screen.findByText('Carol blocked')).toBeTruthy();
  });
});
