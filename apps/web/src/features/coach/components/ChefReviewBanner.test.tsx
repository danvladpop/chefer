// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChefReviewBanner } from './ChefReviewBanner';

// R-14 (Art. 50): the weekly review carries the AI label only when the model
// wrote its text (`review.aiGenerated`), never for the template.

const mockReview = vi.hoisted(() => ({ value: null as object | null }));
vi.mock('@/lib/trpc', () => ({
  trpc: { coach: { currentReview: { useQuery: () => ({ data: mockReview.value }) } } },
}));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'METRIC' }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: () => null,
}));

afterEach(cleanup);

function setReview(aiGenerated: boolean | undefined) {
  mockReview.value = {
    status: 'full',
    review: {
      reviewText: 'A steady week.\nSecond line.',
      adherencePct: 71,
      avgDailyKcal: 2100,
      weightTrendKg: null,
      adjustmentKcal: 0,
      savedEur: null,
      ...(aiGenerated !== undefined && { aiGenerated }),
    },
  };
}

describe('ChefReviewBanner — AI label (R-14)', () => {
  it('labels an AI-written review', () => {
    setReview(true);
    render(<ChefReviewBanner />);
    const chip = screen.getByTestId('coach-review-ai-chip');
    expect(chip.textContent).toContain('AI-generated');
    expect(chip.getAttribute('title')).toBe('This review was written by AI');
  });

  it.each([false, undefined])('shows no label for a template review (%s)', (flag) => {
    setReview(flag);
    render(<ChefReviewBanner />);
    expect(screen.queryByTestId('coach-review-ai-chip')).toBeNull();
  });
});
