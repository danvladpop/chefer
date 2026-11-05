// @vitest-environment jsdom
import { NumbersModeProvider } from '@/features/numbers-mode/numbers-mode';
import { I18nProvider } from '@/lib/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanHistoryCard } from './PlanHistoryCard';

// Lane J phase 4: a past week's card in Romanian.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./UseWeekAgainSheet', () => ({ UseWeekAgainSheet: () => null }));

afterEach(cleanup);

const plan = {
  id: 'w1',
  weekStartDate: '2026-09-21',
  weekEndDate: '2026-09-27',
  status: 'ARCHIVED',
  createdAt: '2026-09-20',
  recipePreview: ['Lentil Curry'],
  macroSummary: { avgKcal: 2100, avgProtein: 112, avgCarbs: 230, avgFat: 70 },
};

describe('PlanHistoryCard in Romanian', () => {
  it('says the week, the badge, the averages and the actions in Romanian', () => {
    render(
      <I18nProvider initialChoice="ro" deviceTags={[]}>
        <NumbersModeProvider mode="FULL">
          <PlanHistoryCard plan={plan} />
        </NumbersModeProvider>
      </I18nProvider>,
    );
    expect(screen.getByText(/^Săptămâna 21 sept\.? – 27 sept\.? 2026$/)).toBeTruthy();
    expect(screen.getByText('Înlocuită')).toBeTruthy();
    expect(document.body.textContent).toContain('2100 kcal în medie');
    expect(document.body.textContent).toContain('112 g P');
    expect(screen.getByText('Vezi')).toBeTruthy();
    expect(screen.getByText('Folosește din nou')).toBeTruthy();
  });
});
