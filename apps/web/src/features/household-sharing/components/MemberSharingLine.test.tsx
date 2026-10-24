// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSEHOLD_SHARING_COPY as COPY, type HouseholdSharingStatus } from '@chefer/types';
import { MemberSharingLine } from './MemberSharingLine';

type MutationOptions = { onSuccess?: (data?: unknown) => void };

const m = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  removePartner: vi.fn(),
  capture: vi.fn(),
  created: null as { code: string; url: string; expiresAt: string } | null,
}));

vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@chefer/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/ui')>()),
  Sheet: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        {children}
        {footer}
      </div>
    ) : null,
}));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  const mutation =
    (fn: (input: unknown) => void, data?: () => unknown) => (opts: MutationOptions) => ({
      isPending: false,
      error: null,
      get data() {
        return data?.();
      },
      mutate: (input: unknown) => {
        fn(input);
        opts.onSuccess?.(data?.());
      },
    });
  return {
    trpc: {
      useUtils: () => ({
        household: { invalidate, sharing: { invalidate } },
        mealPlan: { invalidate },
        shoppingList: { invalidate },
      }),
      user: { me: { useQuery: () => ({ data: { name: 'Dan Pop' } }) } },
      household: {
        invites: {
          create: {
            useMutation: mutation(
              (i) => {
                m.create(i);
              },
              () => m.created,
            ),
          },
          revoke: {
            useMutation: mutation((i) => {
              m.revoke(i);
            }),
          },
        },
        removePartner: {
          useMutation: mutation((i) => {
            m.removePartner(i);
          }),
        },
      },
    },
  };
});

const MARIA_ID = 'cmaria000000000000000000';
const owner = (over: Partial<HouseholdSharingStatus> = {}): HouseholdSharingStatus => ({
  enabled: true,
  role: 'SOLO',
  canInvite: true,
  partners: [],
  invites: [],
  ...over,
});
const maria = { id: MARIA_ID, name: 'Maria', isKid: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.created = {
    code: 'ABCD234567',
    url: 'https://chefer.app/household/join/ABCD234567',
    expiresAt: '2026-11-06T00:00:00.000Z',
  };
});
afterEach(cleanup);

describe('MemberSharingLine', () => {
  it('a kid never gets an invite', () => {
    const { container } = render(
      <MemberSharingLine member={{ ...maria, isKid: true }} status={owner()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('no invite button when the owner cannot invite another partner', () => {
    const { container } = render(
      <MemberSharingLine member={maria} status={owner({ canInvite: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opening the invite makes a link; copying it is the "created" event', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MemberSharingLine member={maria} status={owner()} />);
    fireEvent.click(screen.getByRole('button', { name: `${COPY.inviteButton}: Maria` }));

    const dialog = screen.getByRole('dialog', { name: COPY.inviteSheetTitle('Maria') });
    expect(dialog).toHaveTextContent(COPY.inviteSheetBody('Maria'));
    expect(dialog).toHaveTextContent(COPY.inviteExpires);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledWith({ memberId: MARIA_ID });
    expect(screen.getByTestId('household-invite-link')).toHaveValue(m.created?.url);

    fireEvent.click(screen.getByRole('button', { name: COPY.copyLink }));
    await vi.waitFor(() => expect(screen.getByText(COPY.copied)).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(m.created?.url);
    expect(m.capture).toHaveBeenCalledWith('household_invite_created', { via: 'copy' });
  });

  it('an open invite is shown, not re-made, and can be cancelled', () => {
    const pending = {
      code: 'OPEN000001',
      memberId: MARIA_ID,
      url: 'https://chefer.app/household/join/OPEN000001',
      expiresAt: '2026-11-06T00:00:00.000Z',
    };
    render(<MemberSharingLine member={maria} status={owner({ invites: [pending] })} />);
    expect(screen.getByTestId('household-invite-pending')).toHaveTextContent(COPY.invitePending);
    fireEvent.click(screen.getByRole('button', { name: `${COPY.inviteButton}: Maria` }));
    expect(m.create).not.toHaveBeenCalled();
    expect(screen.getByTestId('household-invite-link')).toHaveValue(pending.url);
    fireEvent.click(screen.getByRole('button', { name: COPY.revoke }));
    expect(m.revoke).toHaveBeenCalledWith({ code: 'OPEN000001' });
  });

  it('a joined partner: badge, who manages the terms, and removal asks first', () => {
    const status = owner({
      role: 'OWNER',
      partners: [{ linkId: 'link1', memberId: MARIA_ID, name: 'Maria', since: '2026-10-01' }],
    });
    render(<MemberSharingLine member={{ ...maria, hasAccount: true }} status={status} />);
    expect(screen.getByText(COPY.joinedBadge)).toBeInTheDocument();
    expect(screen.getByText(COPY.claimedProfileNote('Maria'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: COPY.remove }));
    expect(screen.getByText(COPY.removeConfirm('Maria'))).toBeInTheDocument();
    expect(m.removePartner).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: COPY.remove });
    fireEvent.click(within(confirm).getByRole('button', { name: COPY.remove }));
    expect(m.removePartner).toHaveBeenCalledWith({ linkId: 'link1' });
    expect(m.capture).toHaveBeenCalledWith('household_left', { by: 'owner' });
  });

  it('a partner sees only the note on someone else’s claimed profile', () => {
    const status = owner({ role: 'PARTNER', canInvite: false, owner: { name: 'Dan' } });
    const { rerender } = render(
      <MemberSharingLine member={{ ...maria, hasAccount: true }} status={status} />,
    );
    expect(screen.getByText(COPY.claimedProfileNote('Maria'))).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <MemberSharingLine member={{ ...maria, hasAccount: true, isYou: true }} status={status} />,
    );
    expect(screen.queryByText(COPY.claimedProfileNote('Maria'))).toBeNull();
  });
});
