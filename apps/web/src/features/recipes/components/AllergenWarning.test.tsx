// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AllergenWarningBanner, AllergenWarningChip } from './AllergenWarning';

afterEach(cleanup);

describe('AllergenWarningBanner (F-REC-2-3)', () => {
  it('announces the conflicting allergies', () => {
    render(<AllergenWarningBanner warnings={['Eggs', 'Dairy']} />);
    expect(screen.getByRole('alert').textContent).toContain('Contains Eggs, Dairy.');
  });

  it('renders nothing for a safe recipe', () => {
    const { container } = render(<AllergenWarningBanner warnings={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AllergenWarningChip', () => {
  it('shows the allergens on a meal card', () => {
    render(<AllergenWarningChip warnings={['Peanuts']} />);
    expect(screen.getByTitle('Contains Peanuts')).toBeTruthy();
  });
});
