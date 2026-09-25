import { render, screen } from '@testing-library/react-native';
import {
  AllergenWarningBanner,
  AllergenWarningChip,
} from '../../src/features/recipes/allergen-warning';

describe('AllergenWarningBanner (F-REC-2-3)', () => {
  it('names every conflicting allergy', async () => {
    await render(<AllergenWarningBanner warnings={['Eggs', 'Dairy']} />);
    expect(screen.getByTestId('allergen-warning')).toHaveTextContent(/Contains Eggs, Dairy\./);
  });

  it('renders nothing when the recipe is safe or the field is absent', async () => {
    await render(<AllergenWarningBanner warnings={[]} />);
    expect(screen.queryByTestId('allergen-warning')).toBeNull();
    await render(<AllergenWarningBanner warnings={undefined} />);
    expect(screen.queryByTestId('allergen-warning')).toBeNull();
  });
});

describe('AllergenWarningChip', () => {
  it('labels the chip for screen readers', async () => {
    await render(<AllergenWarningChip warnings={['Peanuts']} />);
    expect(screen.getByLabelText('Contains Peanuts')).toBeTruthy();
  });
});
