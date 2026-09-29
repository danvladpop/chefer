import { render, screen } from '@testing-library/react-native';
import { CheckedForChip } from '../../src/features/safety/checked-for-chip';

describe('CheckedForChip (UX-02 T-02.2)', () => {
  it('shows the compact count with a spelled-out a11y label', async () => {
    await render(<CheckedForChip testID="chip" labels={['tree nuts', 'fish', 'vegetarian']} />);
    expect(screen.getByText('Checked for 3')).toBeTruthy();
    expect(screen.getByLabelText('Checked for tree nuts, fish and vegetarian')).toBeTruthy();
  });

  it('renders nothing when there is nothing to check', async () => {
    await render(<CheckedForChip testID="chip" labels={[]} />);
    expect(screen.queryByTestId('chip')).toBeNull();
  });
});
