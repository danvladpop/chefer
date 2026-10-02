import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ChefReviewBanner } from '../../src/features/coach/chef-review-banner';

// T-11.6 — the weekly review's numbers explain themselves.

const mockReview = jest.fn<unknown, []>();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    coach: { currentReview: { useQuery: () => ({ data: mockReview() }) } },
    preferences: { get: { useQuery: () => ({ data: undefined }) } },
  },
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('ChefReviewBanner', () => {
  it('Why? opens an Explain sheet with the days logged and the budget change', async () => {
    mockReview.mockReturnValue({
      status: 'full',
      review: {
        reviewText: 'A steady week.',
        adherencePct: 71,
        avgDailyKcal: 2100,
        weightTrendKg: null,
        adjustmentKcal: -100,
      },
    });
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChefReviewBanner />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('coach-review-explain-title')).toBeNull();
    await user.press(screen.getByTestId('coach-review-why'));
    expect(await screen.findByText('Where these numbers come from')).toBeOnTheScreen();
    expect(screen.getByText('5 of 7 (71 %)')).toBeOnTheScreen();
    expect(screen.getByText('-100 kcal')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-review-explain-sentence')).toHaveTextContent(
      /you logged 5 of them/,
    );
  });

  // R-14 (Art. 50): the label shows only when the model wrote the text.
  async function renderFull(aiGenerated: boolean | undefined) {
    mockReview.mockReturnValue({
      status: 'full',
      review: {
        reviewText: 'A steady week.',
        adherencePct: 71,
        avgDailyKcal: 2100,
        weightTrendKg: null,
        adjustmentKcal: 0,
        ...(aiGenerated !== undefined && { aiGenerated }),
      },
    });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChefReviewBanner />
      </SafeAreaProvider>,
    );
  }

  it('labels an AI-written review "AI-generated"', async () => {
    await renderFull(true);
    expect(screen.getByTestId('coach-review-ai-chip')).toBeOnTheScreen();
    expect(screen.getByLabelText('This review was written by AI')).toBeOnTheScreen();
  });

  it.each([false, undefined])(
    'shows no AI label for a template review (aiGenerated=%s)',
    async (flag) => {
      await renderFull(flag);
      expect(screen.queryByTestId('coach-review-ai-chip')).toBeNull();
    },
  );
});
