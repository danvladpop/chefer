// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachExplanation } from '@chefer/types';
import { ChefReviewBanner } from './ChefReviewBanner';

// Lane D2: the weekly review's "Why this suggestion" — free sees the
// reasoning in the teaser, premium sees it with the number in the sheet.

const m = vi.hoisted(() => ({ review: null as object | null, capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: { coach: { currentReview: { useQuery: () => ({ data: m.review }) } } },
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'METRIC' }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));

const EXPLANATION: CoachExplanation = {
  version: 1,
  reason: 'plateau',
  suggestedKcal: -100,
  goal: 'LOSE_WEIGHT',
  trend: {
    fromDate: '2026-09-28',
    toDate: '2026-10-18',
    fromKg: 82.4,
    toKg: 82.3,
    spanDays: 20,
    weighIns: 12,
    kgPerWeek: -0.03,
  },
  prevKgPerWeek: 0,
  intake: { avgKcal: 1850, completeDays: 5, incompleteDays: 1, targetKcal: 1900 },
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('ChefReviewBanner — Why this suggestion (lane D2)', () => {
  it('free: the teaser carries the reasoning, without the number', () => {
    m.review = {
      status: 'teaser',
      weekStart: new Date('2026-10-12'),
      firstLine: 'You logged 6 of 7 days.',
      lockedLineCount: 3,
      explanation: { ...EXPLANATION, suggestedKcal: null },
    };
    render(<ChefReviewBanner />);
    const toggle = screen.getByRole('button', { name: 'Why this suggestion' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const panel = screen.getByTestId('coach-why-panel');
    expect(panel.textContent).toContain('1 partly logged day was left out.');
    expect(panel.textContent).toContain('With Premium');
    expect(panel.textContent).not.toContain('−100');
    expect(m.capture).toHaveBeenCalledWith('coach_why_viewed', { tier: 'free', reason: 'plateau' });
  });

  it('a review without an explanation (older rows) shows no Why block', () => {
    m.review = {
      status: 'teaser',
      weekStart: new Date('2026-10-12'),
      firstLine: 'You logged 6 of 7 days.',
      lockedLineCount: 3,
    };
    render(<ChefReviewBanner />);
    expect(screen.queryByTestId('coach-why')).toBeNull();
  });

  it('premium: the full review sheet explains the suggested number', () => {
    m.review = {
      status: 'full',
      review: {
        weekStart: new Date('2026-10-12'),
        reviewText: 'A steady week.\nSecond line.',
        adherencePct: 86,
        avgDailyKcal: 1850,
        weightTrendKg: -0.03,
        adjustmentKcal: 0,
        savedEur: null,
        aiGenerated: false,
        explanation: EXPLANATION,
      },
    };
    render(<ChefReviewBanner />);
    fireEvent.click(screen.getByText('See full review →'));
    fireEvent.click(screen.getByRole('button', { name: 'Why this suggestion' }));
    expect(screen.getByTestId('coach-why-panel').textContent).toContain(
      "so I'd suggest −100 kcal a day for next week.",
    );
    expect(screen.getByText('82.4 kg → 82.3 kg')).toBeTruthy();
  });
});
