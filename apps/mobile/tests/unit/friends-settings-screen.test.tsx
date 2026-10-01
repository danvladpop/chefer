import { Platform } from 'react-native';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { FriendsSettingsScreen } from '../../src/features/friends/settings/settings-screen';
import {
  availableHandlers,
  meDto,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';

// F2.3 M-SETTINGS — Sharing & privacy (UX §11.1, §11.2, §11.5, FR-03–FR-05).
// The fake API keeps a mutable `friends.me` so a save is visible on the next
// read, like the real one.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const MY_ID = 'cme000000000000000000001';

type Settings = NonNullable<FriendsMeDto['settings']>;

function settingsOf(me: FriendsMeDto): Settings {
  if (!me.settings) throw new Error('fixture without settings');
  return me.settings;
}

function fakeApi(
  overrides: {
    settings?: Partial<Settings>;
    counts?: Partial<FriendsMeDto['counts']>;
    updateSettings?: (input: Record<string, unknown>, me: FriendsMeDto) => unknown;
    extra?: Handlers;
  } = {},
) {
  const base = meDto();
  let me: FriendsMeDto = {
    ...base,
    settings: { ...settingsOf(base), ...overrides.settings },
    counts: { ...base.counts, ...overrides.counts },
  };
  const updateSettings = jest.fn((input: unknown) => {
    const patch = input as Record<string, unknown>;
    if (overrides.updateSettings) return overrides.updateSettings(patch, me);
    const { firstName, lastName, ...rest } = patch;
    me = {
      ...me,
      ...(typeof firstName === 'string' ? { firstName } : {}),
      ...(typeof lastName === 'string' ? { lastName } : {}),
      settings: { ...settingsOf(me), ...rest },
    };
    return { ...me, filterHiddenRecipes: 0 };
  });
  const deactivate = jest.fn(() => ({ ok: true }));
  const handlers: Handlers = {
    ...availableHandlers(),
    'friends.me': () => me,
    'auth.me': () => ({ id: MY_ID }),
    'friends.updateSettings': updateSettings,
    'friends.deactivate': deactivate,
    ...overrides.extra,
  };
  return { handlers, updateSettings, deactivate, current: () => me };
}

async function renderSettings(api = fakeApi()) {
  const r = await renderWithTrpc(<FriendsSettingsScreen />, api.handlers);
  await screen.findByTestId('friends-settings-visibility');
  return { r, api };
}

const switchOf = (section: string) => screen.getByTestId(`friends-settings-share-${section}`);
const isOn = (section: string) =>
  (switchOf(section).props.accessibilityState as { checked?: boolean }).checked;

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  // Android path of the kit Sheet: onExited fires when the Modal unmounts.
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('layout', () => {
  it('shows who / what / safety, the preview link, Blocked people with its count, Turn off', async () => {
    await renderSettings(fakeApi({ counts: { blocked: 2 } }));
    expect(screen.getByText(FRIENDS_COPY.settings.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.settings.who)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.settings.what)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.settings.safety)).toBeTruthy();
    expect(screen.getByText('Blocked people (2)')).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.settings.targetsDetail)).toBeTruthy();
    expect(screen.getByTestId('friends-settings-turn-off')).toBeTruthy();
    expect(isOn('plan')).toBe(true);
    expect(isOn('targets')).toBe(false);
    expect(
      screen.getByTestId('friends-settings-visibility-private').props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('has no notifications section (no push, no email)', async () => {
    await renderSettings();
    expect(screen.queryByText(/notification/i)).toBeNull();
    expect(screen.queryByText(/push/i)).toBeNull();
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it('preview opens my own profile; Blocked people opens the list', async () => {
    await renderSettings();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByTestId('friends-settings-preview').props.accessibilityState).toMatchObject(
        {
          disabled: false,
        },
      ),
    );
    await user.press(screen.getByTestId('friends-settings-preview'));
    expect(router.push).toHaveBeenCalledWith(`/friends/${MY_ID}`);
    await user.press(screen.getByTestId('friends-settings-blocked'));
    expect(router.push).toHaveBeenCalledWith('/friends/blocked');
  });

  it('a user who has not turned Following on gets the way to the intro, not the settings', async () => {
    const api = fakeApi();
    api.handlers['friends.me'] = () => meDto({ activated: false, settings: null });
    await renderWithTrpc(<FriendsSettingsScreen />, api.handlers);
    expect(await screen.findByTestId('friends-settings-not-activated')).toBeTruthy();
    expect(screen.queryByTestId('friends-settings-visibility')).toBeNull();
    await userEvent.setup().press(screen.getByTestId('friends-settings-turn-on'));
    expect(router.replace).toHaveBeenCalledWith('/friends');
  });
});

describe('visibility (FR-03)', () => {
  it('forced private: both options locked, Private selected, the explanation, nothing opens', async () => {
    const { api } = await renderSettings(fakeApi({ settings: { forcedPrivate: true } }));
    const pub = screen.getByTestId('friends-settings-visibility-public');
    expect(pub).toBeDisabled();
    expect(screen.getByTestId('friends-settings-visibility-private')).toBeDisabled();
    expect(screen.getByText(FRIENDS_COPY.settings.forcedPrivate)).toBeTruthy();
    await userEvent.setup().press(pub);
    expect(screen.queryByText(FRIENDS_COPY.public.confirm.title)).toBeNull();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('Private → Public: the confirm names what is shared and the pending requests, then saves', async () => {
    const { api } = await renderSettings(fakeApi({ counts: { pendingRequests: 3 } }));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-visibility-public'));
    expect(screen.getByText('Make your profile public?')).toBeTruthy();
    expect(screen.getByTestId('friends-settings-public-confirm-body').props.children).toBe(
      'Anyone on Chefer will be able to follow you without asking, and then see what you share: meals, recipes and workouts.\n\nYour 3 pending requests will be accepted.',
    );
    // Nothing saved until the confirm.
    expect(api.updateSettings).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('friends-settings-public-confirm-confirm'));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ visibility: 'PUBLIC' }));
    await waitFor(() =>
      expect(
        screen.getByTestId('friends-settings-visibility-public').props.accessibilityState,
      ).toMatchObject({ checked: true }),
    );
    expect(track).toHaveBeenCalledWith('friends_visibility_changed', {
      to: 'public',
      autoAccepted: 0,
    });
  });

  it('the Public confirm leaves the pending line out when there are no requests', async () => {
    await renderSettings(fakeApi({ counts: { pendingRequests: 0 } }));
    await userEvent.setup().press(screen.getByTestId('friends-settings-visibility-public'));
    expect(
      screen.getByTestId('friends-settings-public-confirm-body').props.children as string,
    ).not.toContain('pending');
  });

  it('cancelling the Public confirm changes nothing', async () => {
    const { api } = await renderSettings();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-visibility-public'));
    await user.press(screen.getByTestId('friends-settings-public-confirm-cancel'));
    await waitFor(() => expect(screen.queryByText('Make your profile public?')).toBeNull());
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('a failed save keeps the confirm open with `Couldn’t save. Try again.`', async () => {
    const { api } = await renderSettings(
      fakeApi({
        updateSettings: () => {
          throw trpcError('FORBIDDEN', 403);
        },
      }),
    );
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-visibility-public'));
    await user.press(screen.getByTestId('friends-settings-public-confirm-confirm'));
    expect(await screen.findByText('Couldn’t save. Try again.')).toBeTruthy();
    expect(screen.getByText('Make your profile public?')).toBeTruthy();
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('Public → Private: states the followers keep access, saves, and `Review followers` chains after exit', async () => {
    const api = fakeApi({ settings: { visibility: 'PUBLIC' }, counts: { followers: 4 } });
    await renderSettings(api);
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-visibility-private'));
    expect(screen.getByText('Make your profile private?')).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.private.confirm.body(4))).toBeTruthy();
    await user.press(screen.getByTestId('friends-settings-private-confirm-confirm'));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ visibility: 'PRIVATE' }));
    expect(router.dismissTo).not.toHaveBeenCalled();

    // Review followers: closes, THEN navigates (from onExited).
    await user.press(screen.getByTestId('friends-settings-visibility-public'));
    await user.press(screen.getByTestId('friends-settings-public-confirm-confirm'));
    await waitFor(() =>
      expect(
        screen.getByTestId('friends-settings-visibility-public').props.accessibilityState,
      ).toMatchObject({ checked: true }),
    );
    await user.press(screen.getByTestId('friends-settings-visibility-private'));
    await user.press(screen.getByTestId('friends-settings-private-confirm-review'));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledTimes(1));
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/friends',
      params: { list: 'followers' },
    });
  });
});

describe('sharing switches (FR-04)', () => {
  it('saves on change, optimistically, and keeps the new value', async () => {
    const { api } = await renderSettings();
    await fireEvent(switchOf('plan'), 'valueChange', false);
    await waitFor(() => expect(isOn('plan')).toBe(false));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ sharePlan: false }));
    await waitFor(() => expect(api.current().settings?.sharePlan).toBe(false));
    expect(isOn('plan')).toBe(false);
    expect(track).toHaveBeenCalledWith('friends_sharing_changed', { section: 'plan', on: false });
  });

  it('rolls the switch back with `Couldn’t save. Try again.` when the save fails', async () => {
    await renderSettings(
      fakeApi({
        updateSettings: () => {
          throw trpcError('INTERNAL_SERVER_ERROR', 500);
        },
      }),
    );
    await fireEvent(switchOf('workouts'), 'valueChange', false);
    expect(await screen.findByText('Couldn’t save. Try again.')).toBeTruthy();
    await waitFor(() => expect(isOn('workouts')).toBe(true));
  });

  it('turning recipes on tells how many recipes the filter hid', async () => {
    await renderSettings(
      fakeApi({
        settings: { shareRecipes: false },
        updateSettings: (_input, me) => ({
          ...me,
          settings: { ...settingsOf(me), shareRecipes: true },
          filterHiddenRecipes: 2,
        }),
      }),
    );
    await fireEvent(switchOf('recipes'), 'valueChange', true);
    expect(await screen.findByText(FRIENDS_COPY.activated.filterHidden(2))).toBeTruthy();
  });

  it('no snackbar when no recipe was hidden, or when recipes are turned off', async () => {
    const { api } = await renderSettings(fakeApi({ settings: { shareRecipes: false } }));
    await fireEvent(switchOf('recipes'), 'valueChange', true);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ shareRecipes: true }));
    expect(screen.queryByText(/won’t be shown to followers/)).toBeNull();
  });

  it('daily targets ask first: the switch stays off and nothing saves until `Share targets`', async () => {
    const { api } = await renderSettings();
    const user = userEvent.setup();
    await fireEvent(switchOf('targets'), 'valueChange', true);
    expect(screen.getByText('Share your daily targets?')).toBeTruthy();
    expect(
      screen.getByText(
        'Followers will see your daily calorie and macro targets next to your meal plan.',
      ),
    ).toBeTruthy();
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(isOn('targets')).toBe(false);

    await user.press(screen.getByTestId('friends-settings-targets-confirm-confirm'));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ shareTargets: true }));
    await waitFor(() => expect(isOn('targets')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Share your daily targets?')).toBeNull());
    expect(track).toHaveBeenCalledWith('friends_sharing_changed', { section: 'targets', on: true });
  });

  it('cancelling the targets confirm leaves the switch off and saves nothing', async () => {
    const { api } = await renderSettings();
    await fireEvent(switchOf('targets'), 'valueChange', true);
    await userEvent.setup().press(screen.getByTestId('friends-settings-targets-confirm-cancel'));
    await waitFor(() => expect(screen.queryByText('Share your daily targets?')).toBeNull());
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(isOn('targets')).toBe(false);
  });

  it('turning targets OFF needs no confirm', async () => {
    const { api } = await renderSettings(fakeApi({ settings: { shareTargets: true } }));
    await fireEvent(switchOf('targets'), 'valueChange', false);
    expect(screen.queryByText('Share your daily targets?')).toBeNull();
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ shareTargets: false }));
  });
});

describe('name (FR-02.6)', () => {
  const nameInputs = () => ({
    first: screen.getByTestId('friends-settings-first-name'),
    last: screen.getByTestId('friends-settings-last-name'),
  });

  it('prefills the name and saves it when the field is left', async () => {
    const { api } = await renderSettings();
    const { first } = nameInputs();
    expect(first.props.value).toBe('Dan');
    expect(nameInputs().last.props.value).toBe('Pop');
    await fireEvent(first, 'focus');
    await fireEvent.changeText(first, '  Daniel ');
    await fireEvent(first, 'blur');
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({ firstName: 'Daniel', lastName: 'Pop' }),
    );
  });

  it('an unchanged name saves nothing; an empty one shows `Add your first name`', async () => {
    const { api } = await renderSettings();
    const { first } = nameInputs();
    await fireEvent(first, 'focus');
    await fireEvent(first, 'blur');
    expect(api.updateSettings).not.toHaveBeenCalled();
    await fireEvent(first, 'focus');
    await fireEvent.changeText(first, '   ');
    await fireEvent(first, 'blur');
    expect(await screen.findByText('Add your first name')).toBeTruthy();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('shows the name-rejected message when the word filter refuses the name', async () => {
    await renderSettings(
      fakeApi({
        updateSettings: () => {
          throw trpcError('BAD_REQUEST', 400, { textRejected: 'name' });
        },
      }),
    );
    const { last } = nameInputs();
    await fireEvent(last, 'focus');
    await fireEvent.changeText(last, 'Rejected');
    await fireEvent(last, 'blur');
    expect(await screen.findByText(FRIENDS_COPY.intro.nameRejected)).toBeTruthy();
    expect(nameInputs().last.props.value).toBe('Rejected');
    expect(track).toHaveBeenCalledWith('friend_text_rejected', { field: 'name' });
  });
});

describe('turn off (FR-05, FD-14)', () => {
  it('lists the consequences, calls deactivate with the confirm token, then leaves to More', async () => {
    const { api } = await renderSettings();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-turn-off'));
    expect(screen.getByText('Turn off Following?')).toBeTruthy();
    const body = screen.getByTestId('friends-settings-turn-off-confirm-body').props
      .children as string;
    expect(body).toContain('This removes you from Following straight away:');
    for (const bullet of FRIENDS_COPY.turnOff.bullets) expect(body).toContain(`• ${bullet}`);
    expect(body).toContain('You can turn Following on again later, starting fresh.');
    expect(api.deactivate).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('friends-settings-turn-off-confirm-confirm'));
    await waitFor(() => expect(api.deactivate).toHaveBeenCalledWith({ confirm: 'TURN_OFF' }));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(food)/more'));
    expect(await screen.findByText('Following is off.')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('friends_deactivated', {
      followingCount: 3,
      followerCount: 2,
    });
  });

  it('refetches friends.me after turning off', async () => {
    const { r } = await renderSettings();
    const before = r.paths().filter((p) => p === 'friends.me').length;
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-turn-off'));
    await user.press(screen.getByTestId('friends-settings-turn-off-confirm-confirm'));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());
    await waitFor(() =>
      expect(r.paths().filter((p) => p === 'friends.me').length).toBeGreaterThan(before),
    );
  });

  it('cancelling (or an error) stays on the screen and does not navigate', async () => {
    const api = fakeApi();
    api.handlers['friends.deactivate'] = () => {
      throw trpcError('INTERNAL_SERVER_ERROR', 500);
    };
    await renderSettings(api);
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-settings-turn-off'));
    await user.press(screen.getByTestId('friends-settings-turn-off-confirm-confirm'));
    expect(await screen.findByText('Couldn’t save. Try again.')).toBeTruthy();
    await user.press(screen.getByTestId('friends-settings-turn-off-confirm-cancel'));
    await waitFor(() => expect(screen.queryByText('Turn off Following?')).toBeNull());
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
