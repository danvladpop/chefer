import { Alert, Platform, Share } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { HOUSEHOLD_SHARING_COPY, type HouseholdSharingStatus } from '@chefer/types';
import HouseholdScreen from '../../app/household';
import { renderWithTrpc, type Handlers } from './friends-core-harness';

// ADR 0003 on the Household screen: an owner invites an adult member (the link, the OS share sheet,
// Cancel invite), sees "Has Chefer" on a claimed profile and can remove that partner; a partner sees
// whose household it is, the owner's table read-only except their own profile, and can leave.
// Household notices sit at the top and can be dismissed.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

jest.setTimeout(30_000);

const MARIA = 'cmaria000000000000000001';
const SAM = 'csam00000000000000000001';
const LINK = 'clink00000000000000000001';

function member(over: Record<string, unknown>) {
  return {
    userId: 'owner',
    portionFactor: 1,
    isKid: false,
    ageBand: null,
    allergies: [],
    dietaryRestrictions: [],
    dislikedIngredients: [],
    hasAccount: false,
    isYou: false,
    ...over,
  };
}

function status(over: Partial<HouseholdSharingStatus> = {}): HouseholdSharingStatus {
  return { enabled: true, role: 'SOLO', canInvite: true, partners: [], invites: [], ...over };
}

function handlers(over: Handlers = {}): Handlers {
  return {
    'household.list': () => [
      member({ id: MARIA, name: 'Maria' }),
      member({ id: SAM, name: 'Sam', isKid: true, portionFactor: 0.5 }),
    ],
    'household.sharing': () => status(),
    'household.notices': () => [],
    'preferences.get': () => ({ dietaryPreferences: { allergies: [], dietaryRestrictions: [] } }),
    'safety.getTable': () => ({ people: [], hasRules: false, needsReview: false }),
    'user.me': () => ({ firstName: 'Dan', name: 'Dan Pop' }),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterEach(() => jest.restoreAllMocks());

describe('Household screen: owner', () => {
  it('invites an adult member (never a kid): link, share sheet, Cancel invite', async () => {
    const user = userEvent.setup();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const { calls } = await renderWithTrpc(
      <HouseholdScreen />,
      handlers({
        'household.invites.create': () => ({
          code: 'HOME234567',
          url: 'https://chefer.app/household/join/HOME234567',
          expiresAt: '2026-11-06T00:00:00.000Z',
        }),
        'household.invites.revoke': () => ({ ok: true }),
      }),
    );
    await user.press(await screen.findByTestId(`household-invite-${MARIA}`));
    expect(screen.queryByTestId(`household-invite-${SAM}`)).toBeNull();
    expect(await screen.findByTestId('household-invite-url')).toHaveTextContent(
      'https://chefer.app/household/join/HOME234567',
    );
    expect(screen.getByText(HOUSEHOLD_SHARING_COPY.inviteSheetBody('Maria'))).toBeTruthy();
    expect(calls.find((c) => c.path === 'household.invites.create')?.input).toEqual({
      memberId: MARIA,
    });

    await user.press(screen.getByTestId('household-invite-share'));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        message: `${HOUSEHOLD_SHARING_COPY.shareMessage('Dan')}https://chefer.app/household/join/HOME234567`,
      }),
    );
    expect(track).toHaveBeenCalledWith('household_invite_created', { via: 'share' });

    await user.press(screen.getByTestId('household-invite-revoke'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'household.invites.revoke')?.input).toEqual({
        code: 'HOME234567',
      }),
    );
  });

  it('a claimed profile shows "Has Chefer" and can be removed after a confirm', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert');
    const { calls } = await renderWithTrpc(
      <HouseholdScreen />,
      handlers({
        'household.list': () => [member({ id: MARIA, name: 'Maria', hasAccount: true })],
        'household.sharing': () =>
          status({
            role: 'OWNER',
            partners: [{ linkId: LINK, memberId: MARIA, name: 'Maria', since: '2026-10-20' }],
          }),
        'household.removePartner': () => ({ ok: true }),
      }),
    );
    expect(await screen.findByText(HOUSEHOLD_SHARING_COPY.joinedBadge)).toBeTruthy();
    expect(screen.getByText(HOUSEHOLD_SHARING_COPY.claimedProfileNote('Maria'))).toBeTruthy();
    expect(screen.queryByTestId(`household-invite-${MARIA}`)).toBeNull();

    await user.press(screen.getByTestId(`household-remove-partner-${MARIA}`));
    expect(alert).toHaveBeenCalledWith(
      HOUSEHOLD_SHARING_COPY.remove,
      HOUSEHOLD_SHARING_COPY.removeConfirm('Maria'),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'household.removePartner')?.input).toEqual({
        linkId: LINK,
      }),
    );
    await waitFor(() => expect(track).toHaveBeenCalledWith('household_left', { by: 'owner' }));
  });

  it('notices show at the top and can be dismissed', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <HouseholdScreen />,
      handlers({
        'household.notices': () => [
          {
            id: 'n1',
            kind: 'HOUSEHOLD_PARTNER_JOINED',
            name: 'Maria',
            createdAt: '2026-10-22T10:00:00.000Z',
            read: false,
          },
        ],
        'household.dismissNotice': () => ({ ok: true }),
      }),
    );
    expect(
      await screen.findByText(HOUSEHOLD_SHARING_COPY.notice.HOUSEHOLD_PARTNER_JOINED('Maria')),
    ).toBeTruthy();
    await user.press(screen.getByTestId('household-notice-n1-dismiss'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'household.dismissNotice')?.input).toEqual({ id: 'n1' }),
    );
  });

  it('sharing off: no invite, no badge, no notices asked for', async () => {
    const { paths } = await renderWithTrpc(
      <HouseholdScreen />,
      handlers({ 'household.sharing': () => status({ enabled: false }) }),
    );
    expect(await screen.findByText('Maria')).toBeTruthy();
    expect(screen.queryByTestId(`household-invite-${MARIA}`)).toBeNull();
    expect(paths()).not.toContain('household.notices');
  });
});

describe('Household screen: partner', () => {
  const partnerHandlers = (over: Handlers = {}) =>
    handlers({
      'household.list': () => [
        member({ id: MARIA, name: 'Maria', hasAccount: true, isYou: true, userId: '' }),
        member({ id: SAM, name: 'Sam', isKid: true, userId: '' }),
      ],
      'household.sharing': () =>
        status({
          role: 'PARTNER',
          canInvite: false,
          owner: { name: 'Dan' },
          myProfile: { memberId: MARIA, name: 'Maria', portionFactor: 0.75 },
        }),
      ...over,
    });

  it("reads Dan's table: own profile editable, others read-only, nothing to add or invite", async () => {
    await renderWithTrpc(<HouseholdScreen />, partnerHandlers());
    expect(await screen.findByText(HOUSEHOLD_SHARING_COPY.partnerBanner('Dan'))).toBeTruthy();
    expect(screen.getByTestId(`household-edit-${MARIA}`)).toBeTruthy();
    expect(screen.queryByTestId(`household-edit-${SAM}`)).toBeNull();
    expect(screen.queryByTestId(`household-remove-${SAM}`)).toBeNull();
    expect(screen.queryByTestId(`household-remove-${MARIA}`)).toBeNull();
    expect(screen.queryByTestId('household-form')).toBeNull();
    expect(screen.queryByTestId(`household-invite-${SAM}`)).toBeNull();
    expect(screen.queryByTestId('household-you-card')).toBeNull();
  });

  it('leaves after the confirm', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert');
    const { calls } = await renderWithTrpc(
      <HouseholdScreen />,
      partnerHandlers({ 'household.leave': () => ({ ok: true }) }),
    );
    await user.press(await screen.findByTestId('household-leave'));
    expect(alert).toHaveBeenCalledWith(
      HOUSEHOLD_SHARING_COPY.leave,
      HOUSEHOLD_SHARING_COPY.leaveConfirm('Dan'),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() => expect(calls.some((c) => c.path === 'household.leave')).toBe(true));
    await waitFor(() => expect(track).toHaveBeenCalledWith('household_left', { by: 'partner' }));
  });
});
