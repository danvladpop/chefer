// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdherenceDto } from '@chefer/types';
import { AdherenceView, dayState } from './AdherenceTab';

afterEach(cleanup);

describe('dayState', () => {
  it('trained wins; paused is not missed; planned and untrained is missed; else rest', () => {
    expect(dayState({ localDate: '2026-10-01', planned: true, trained: true, paused: false })).toBe(
      'trained',
    );
    expect(dayState({ localDate: '2026-10-01', planned: true, trained: false, paused: true })).toBe(
      'paused',
    );
    expect(
      dayState({ localDate: '2026-10-01', planned: true, trained: false, paused: false }),
    ).toBe('missed');
    expect(
      dayState({ localDate: '2026-10-01', planned: false, trained: false, paused: false }),
    ).toBe('rest');
  });
});

describe('AdherenceView', () => {
  const adherence: AdherenceDto = {
    weeks: [
      { weekStart: '2026-09-21', goal: 3, sessions: 3, status: 'met' },
      { weekStart: '2026-09-28', goal: 3, sessions: 1, status: 'paused' },
      { weekStart: '2026-10-05', goal: 3, sessions: 0, status: 'current' },
    ],
    days: [
      { localDate: '2026-10-01', planned: true, trained: true, paused: false },
      { localDate: '2026-10-02', planned: true, trained: false, paused: true },
      { localDate: '2026-10-03', planned: true, trained: false, paused: false },
      { localDate: '2026-10-04', planned: false, trained: false, paused: false },
    ],
  };

  it('shows weeks against the goal and a paused week with no reason', () => {
    render(<AdherenceView adherence={adherence} />);
    const weeks = screen.getAllByTestId('adherence-week');
    expect(weeks).toHaveLength(3);
    expect(weeks[0]).toHaveTextContent('3 / 3');
    expect(weeks[1]).toHaveTextContent('Paused');
    expect(weeks[1]).not.toHaveTextContent(/vacation|illness|injury/i);
  });

  it('labels every day of the strip by state, not by colour alone', () => {
    render(<AdherenceView adherence={adherence} />);
    const strip = screen.getByTestId('adherence-strip');
    const states = Array.from(strip.querySelectorAll('li')).map((li) =>
      li.getAttribute('data-state'),
    );
    expect(states).toEqual(['trained', 'paused', 'missed', 'rest']);
    for (const li of Array.from(strip.querySelectorAll('li'))) {
      expect(li.getAttribute('aria-label')).toMatch(/: (Trained|Paused|Missed|Rest)$/);
    }
  });
});
