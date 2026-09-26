import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { FeedbackCard } from '../../src/features/feedback/feedback-card';
import { PantryGhostBanner } from '../../src/features/pantry/pantry-ghost-banner';
import { PostUpgradeSheet } from '../../src/features/premium/post-upgrade-sheet';

// Parity drain (mobile_parity_backlog.md, 2026-09-26): the feedback counter
// (F-PROF-2-2), the source-aware post-upgrade sheet (F-PREM-1-5, F-PM-9) and
// the free pantry ghost banner (F3 §6.4) — each mirrors its web component.

const mockPush = jest.fn();
const mockSubmit = jest.fn();
let mockHasProfile: boolean | undefined = true;
let mockPantryCount = 0;

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate: mockSubmit,
          isPending: false,
          isSuccess: false,
          isError: false,
          error: null,
        }),
      },
    },
    preferences: {
      hasProfile: { useQuery: () => ({ data: mockHasProfile }) },
    },
    pantry: {
      list: { useQuery: () => ({ data: { items: [], count: mockPantryCount } }) },
    },
  },
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHasProfile = true;
  mockPantryCount = 0;
});

describe('FeedbackCard (F-PROF-2-2)', () => {
  it('labels the field and counts against the 2,000-character cap', async () => {
    const user = userEvent.setup();
    await render(<FeedbackCard />);
    const input = screen.getByTestId('feedback-input');
    expect(input.props.maxLength).toBe(2000);
    expect(input.props.accessibilityLabel).toBe('Your feedback');
    expect(screen.getByText('Your feedback')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-counter')).toHaveTextContent('0 / 2,000');

    await user.type(input, 'Great app');
    expect(screen.getByTestId('feedback-counter')).toHaveTextContent('9 / 2,000');
  });

  it('says when the limit is reached', async () => {
    await render(<FeedbackCard />);
    await fireEvent.changeText(screen.getByTestId('feedback-input'), 'x'.repeat(2000));
    expect(screen.getByTestId('feedback-counter')).toHaveTextContent(
      'Limit reached: 2,000 characters',
    );
  });
});

describe('PostUpgradeSheet (F-PREM-1-5, F-PM-9)', () => {
  const renderSheet = (source: string | null) =>
    render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <PostUpgradeSheet visible onClose={jest.fn()} source={source} />
      </SafeAreaProvider>,
    );

  it('a household upgrade leads with "Add your table" → the Household screen', async () => {
    const user = userEvent.setup();
    await renderSheet('household');
    expect(screen.getByTestId('post-upgrade-primary')).toHaveTextContent('Add your table →');
    await user.press(screen.getByTestId('post-upgrade-primary'));
    expect(mockPush).toHaveBeenCalledWith('/household');
  });

  it('never offers onboarding to a user who has a profile', async () => {
    await renderSheet(null);
    expect(screen.queryByTestId('post-upgrade-step-profile')).toBeNull();
    expect(screen.getByTestId('post-upgrade-step-regenerate')).toBeOnTheScreen();
  });

  it('a user without a profile gets the goal step', async () => {
    mockHasProfile = false;
    await renderSheet(null);
    expect(screen.getByTestId('post-upgrade-step-profile')).toBeOnTheScreen();
  });
});

describe('PantryGhostBanner (F3 §6.4)', () => {
  it('hides until check-offs have seeded the kitchen', async () => {
    await render(<PantryGhostBanner savedEur={4.5} />);
    expect(screen.queryByTestId('pantry-ghost')).toBeNull();
  });

  it('shows the real count and savings, and upgrades with the pantry source', async () => {
    mockPantryCount = 3;
    const user = userEvent.setup();
    await render(<PantryGhostBanner savedEur={4.5} />);
    expect(screen.getByTestId('pantry-ghost')).toHaveTextContent(/You now have 3 items/);
    expect(screen.getByTestId('pantry-ghost-saved')).toHaveTextContent(/saved ~€4\.50/);
    await user.press(screen.getByTestId('pantry-ghost-upgrade'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/profile', params: { source: 'pantry' } });
  });
});
