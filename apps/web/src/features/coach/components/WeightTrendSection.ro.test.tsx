// @vitest-environment jsdom
import { I18nProvider } from '@/lib/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFormatLocale } from '@chefer/utils';
import { WeightTrendSection } from './WeightTrendSection';

// Lane J phase 4: the Progress weight card in Romanian.

vi.mock('./WeightEntriesList', () => ({ WeightEntriesList: () => null }));
vi.mock('./WeightLogForm', () => ({ WeightLogForm: () => null }));
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    Line: Null,
    LineChart: Null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: Null,
    XAxis: Null,
    YAxis: Null,
  };
});

afterEach(() => {
  cleanup();
  setFormatLocale(null);
});

const day = (n: number, weightKg: number) => ({
  id: `w${n}`,
  weightKg,
  recordedAt: new Date(Date.now() - n * 86_400_000),
});

describe('WeightTrendSection in Romanian', () => {
  it('labels the card, the change over the range and the explainer in Romanian', () => {
    render(
      <I18nProvider initialChoice="ro" deviceTags={[]}>
        <WeightTrendSection
          entries={[day(20, 84), day(10, 83), day(1, 82)]}
          range={30}
          system="METRIC"
          goal="LOSE_WEIGHT"
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Evoluția greutății')).toBeTruthy();
    expect(screen.getByText('Ultima cântărire:')).toBeTruthy();
    expect(screen.getByTestId('progress-weight-change').textContent).toMatch(
      /^Tendință −\d.* kg în 30 de zile$/,
    );
    expect(screen.getByTestId('progress-weight-explainer').textContent).toContain(
      'Linia este tendința greutății tale.',
    );
  });

  it('says how many weigh-ins the trend needs, in Romanian', () => {
    render(
      <I18nProvider initialChoice="ro" deviceTags={[]}>
        <WeightTrendSection entries={[day(1, 82)]} range={7} system="METRIC" goal={null} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('progress-weight-few').textContent).toBe(
      'Cântărește-te de două ori în 7 zile ca să-ți vezi aici tendința.',
    );
  });
});
