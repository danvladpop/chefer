import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import ProfileScreen from '../../app/profile';

// T-21.13: the household summary line ("N at the table: you, A, B, C, …")
// must wrap, not clip to one line — a household of several names, or the
// same names at a large Dynamic Type size, needs more than one line to
// read. A `numberOfLines={1}` on this Text is exactly the bug (RN Text
// truncates with an ellipsis and no way to see the rest).

const mockMembers = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }, { name: 'Dave' }];

jest.mock('../../src/features/profile/sign-in-methods-card', () => ({
  SignInMethodsCard: () => null,
}));
jest.mock('../../src/features/privacy/privacy-section', () => ({
  PrivacySection: () => null,
}));

jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/premium/use-premium-pitch', () => ({
  usePremiumPitch: () => ({ bullets: [], alsoIncluded: [] }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { back: jest.fn(), push: jest.fn() },
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
      downgradePlan: {
        useMutation: () => ({ mutate: jest.fn(), reset: jest.fn(), isPending: false }),
      },
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
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ProfileScreen />
      </SafeAreaProvider>,
    );

    const summary = screen.getByText(/at the table: you, Alice, Bob, Carol, Dave/);
    expect(summary.props.numberOfLines).toBeUndefined();
  });
});
