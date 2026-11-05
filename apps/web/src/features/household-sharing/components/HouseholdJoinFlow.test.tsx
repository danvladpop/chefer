// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSEHOLD_SHARING_COPY as COPY, type HouseholdInvitePreview } from '@chefer/types';
import { HouseholdJoinFlow } from './HouseholdJoinFlow';

type MutationOptions = { onSuccess?: () => void; onError?: (err: unknown) => void };

type Mocks = {
  preview: { data: HouseholdInvitePreview | undefined; isLoading: boolean; isError: boolean };
  join: ReturnType<typeof vi.fn>;
  joinError: unknown;
  push: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  consentAsks: number;
  meInvalidate: ReturnType<typeof vi.fn<[], Promise<void>>>;
};

const m = vi.hoisted(
  (): Mocks => ({
    preview: { data: undefined, isLoading: false, isError: false },
    join: vi.fn(),
    joinError: null,
    push: vi.fn(),
    capture: vi.fn(),
    consentAsks: 0,
    meInvalidate: vi.fn(() => Promise.resolve()),
  }),
);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
// The consent guard has its own tests: here it counts asks and runs the save.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => {
      m.consentAsks += 1;
      run();
    },
    healthConsentSheet: null,
  }),
}));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        household: { invalidate },
        mealPlan: { invalidate },
        shoppingList: { invalidate },
        user: { me: { invalidate: m.meInvalidate } },
      }),
      household: {
        previewInvite: { useQuery: () => m.preview },
        join: {
          useMutation: (opts: MutationOptions) => ({
            isPending: false,
            mutate: (input: unknown) => {
              m.join(input);
              if (m.joinError) opts.onError?.(m.joinError);
              else opts.onSuccess?.();
            },
          }),
        },
      },
    },
  };
});

const OK: HouseholdInvitePreview = {
  state: 'OK',
  ownerName: 'Dan',
  profile: {
    name: 'Maria',
    portionFactor: 1,
    isKid: false,
    allergies: ['peanuts'],
    dietaryRestrictions: ['vegetarian'],
    dislikedIngredients: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.preview = { data: OK, isLoading: false, isError: false };
  m.joinError = null;
  m.consentAsks = 0;
});
afterEach(cleanup);

describe('HouseholdJoinFlow', () => {
  it('shows what is shared, what stays private, and the profile to confirm', () => {
    render(<HouseholdJoinFlow code="ABCD234567" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(COPY.joinTitle('Dan'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(COPY.joinLede('Dan', 'Maria'))).toBeInTheDocument();
    for (const line of COPY.joinShares) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText(COPY.joinPrivate)).toBeInTheDocument();
    expect(screen.getByText(COPY.joinOwnPlansNote)).toBeInTheDocument();
    expect(screen.getByText(COPY.joinPortion('a standard portion'))).toBeInTheDocument();
    expect(m.capture).toHaveBeenCalledWith('household_invite_opened', {
      state: 'OK',
      signedIn: true,
    });
  });

  it('joins with the terms as confirmed and opens the shared week', () => {
    render(<HouseholdJoinFlow code="ABCD234567" />);
    fireEvent.click(screen.getByRole('button', { name: COPY.joinAllow }));
    expect(m.join).toHaveBeenCalledWith({
      code: 'ABCD234567',
      allergies: ['peanuts'],
      dietaryRestrictions: ['vegetarian'],
      dislikedIngredients: [],
    });
    expect(m.capture).toHaveBeenCalledWith('household_joined', { editedSafety: false });
    expect(m.push).toHaveBeenCalledWith('/meal-plan');
  });

  it('the partner can fix the terms before joining', () => {
    render(<HouseholdJoinFlow code="ABCD234567" />);
    const allergies = screen.getByTestId('join-safety-allergies');
    fireEvent.click(within(allergies).getByRole('button', { name: /^Remove / }));
    const dislikes = screen.getByTestId('join-safety-dislikedIngredients');
    fireEvent.change(within(dislikes).getByLabelText(COPY.joinSafetyAddLabel('Dislikes')), {
      target: { value: 'coriander' },
    });
    fireEvent.click(within(dislikes).getByRole('button', { name: COPY.joinSafetyAdd }));
    fireEvent.click(screen.getByRole('button', { name: COPY.joinAllow }));
    expect(m.join).toHaveBeenCalledWith({
      code: 'ABCD234567',
      allergies: [],
      dietaryRestrictions: ['vegetarian'],
      dislikedIngredients: ['coriander'],
    });
    expect(m.capture).toHaveBeenCalledWith('household_joined', { editedSafety: true });
  });

  it('asks for health consent again (once) when the server says it is missing', async () => {
    m.joinError = { data: { healthConsentRequired: true } };
    render(<HouseholdJoinFlow code="ABCD234567" />);
    fireEvent.click(screen.getByRole('button', { name: COPY.joinAllow }));
    await vi.waitFor(() => expect(m.join).toHaveBeenCalledTimes(2));
    expect(m.meInvalidate).toHaveBeenCalledTimes(1);
    expect(m.consentAsks).toBe(2);
    expect(m.push).not.toHaveBeenCalled();
  });

  it('"Not now" leaves without joining', () => {
    render(<HouseholdJoinFlow code="ABCD234567" />);
    fireEvent.click(screen.getByRole('button', { name: COPY.joinDecline }));
    expect(m.join).not.toHaveBeenCalled();
    expect(m.push).toHaveBeenCalledWith('/dashboard');
  });

  it.each([
    ['EXPIRED', COPY.inviteState.EXPIRED],
    ['USED', COPY.inviteState.USED],
    ['REVOKED', COPY.inviteState.REVOKED],
    ['SELF', COPY.inviteState.SELF],
    ['NOT_FOUND', COPY.inviteState.NOT_FOUND],
    ['ALREADY_JOINED', COPY.inviteState.ALREADY_JOINED],
    ['HAS_PARTNERS', COPY.inviteState.HAS_PARTNERS],
    ['PROFILE_TAKEN', COPY.inviteState.PROFILE_TAKEN],
  ] as const)('%s: one sentence, no join button', (state, copy) => {
    m.preview = { data: { state }, isLoading: false, isError: false };
    render(<HouseholdJoinFlow code="ABCD234567" />);
    expect(screen.getByTestId('household-invite-message')).toHaveTextContent(copy);
    expect(screen.queryByRole('button', { name: COPY.joinAllow })).toBeNull();
  });

  it('names the current household when the person is in another one', () => {
    m.preview = {
      data: { state: 'IN_OTHER_HOUSEHOLD', currentOwnerName: 'Ion' },
      isLoading: false,
      isError: false,
    };
    render(<HouseholdJoinFlow code="ABCD234567" />);
    expect(screen.getByTestId('household-invite-message')).toHaveTextContent(
      COPY.inviteState.IN_OTHER_HOUSEHOLD('Ion'),
    );
  });

  it('a failed preview reads like an unknown link', () => {
    m.preview = { data: undefined, isLoading: false, isError: true };
    render(<HouseholdJoinFlow code="ABCD234567" />);
    expect(screen.getByTestId('household-invite-message')).toHaveTextContent(
      COPY.inviteState.NOT_FOUND,
    );
  });
});
