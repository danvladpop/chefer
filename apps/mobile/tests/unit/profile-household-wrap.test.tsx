import { render, screen } from '@testing-library/react-native';
import ProfileScreen from '../../app/profile';

// T-21.13: the household summary line ("N at the table: you, A, B, C, …")
// must wrap, not clip to one line — a household of several names, or the
// same names at a large Dynamic Type size, needs more than one line to
// read. A `numberOfLines={1}` on this Text is exactly the bug (RN Text
// truncates with an ellipsis and no way to see the rest).

const mockMembers = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }, { name: 'Dave' }];

jest.mock('../../src/features/privacy/privacy-section', () => ({
  PrivacySection: () => null,
}));

jest.mock('../../src/features/premium/post-upgrade-sheet', () => ({
  PostUpgradeSheet: () => null,
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: { me: { invalidate: jest.fn() } },
      auth: { me: { invalidate: jest.fn() } },
    }),
    user: {
      me: {
        useQuery: () => ({
          data: {
            firstName: 'Ana',
            lastName: null,
            email: 'ana@test.dev',
            role: 'USER',
            planTier: 'FREE',
          },
        }),
      },
      upgradePlan: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      downgradePlan: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    profile: {
      getAiUsage: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    household: {
      list: { useQuery: () => ({ data: mockMembers }) },
    },
  },
}));

describe('Profile household row (T-21.13)', () => {
  it('never caps the household summary to one line', async () => {
    await render(<ProfileScreen />);

    const summary = screen.getByText(/at the table: you, Alice, Bob, Carol, Dave/);
    expect(summary.props.numberOfLines).toBeUndefined();
  });
});
