import { render, screen, userEvent } from '@testing-library/react-native';
import { FilteredForLine } from '../../src/features/safety/filtered-for-line';
import { LabelCaveat } from '../../src/features/safety/label-caveat';

// PAT-2 rows (technical-plan.md / synthesis 03-ux-design-spec.md §2.2),
// T-00.16: FilteredForLine + LabelCaveat.

describe('FilteredForLine', () => {
  it('renders the filter summary and hidden count with an accessible label', async () => {
    await render(<FilteredForLine filters="vegan + gluten-free" hiddenCount={14} testID="ffl" />);
    expect(screen.getByText('Filtered for vegan + gluten-free · 14 hidden')).toBeOnTheScreen();
    expect(screen.getByTestId('ffl').props.accessibilityLabel).toBe(
      'Filtered for vegan + gluten-free · 14 hidden',
    );
  });

  it('is tappable and fires onPress when given', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <FilteredForLine filters="vegan" hiddenCount={3} onPress={onPress} testID="ffl" />,
    );
    expect(screen.getByTestId('ffl').props.accessibilityRole).toBe('button');
    await user.press(screen.getByTestId('ffl'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders as a plain (non-pressable) line when onPress is omitted', async () => {
    await render(<FilteredForLine filters="vegan" hiddenCount={3} testID="ffl" />);
    expect(screen.getByTestId('ffl').props.accessibilityRole).toBeUndefined();
  });
});

describe('LabelCaveat', () => {
  it('renders the caveat text', async () => {
    await render(<LabelCaveat text="Buy certified gluten-free" testID="caveat" />);
    expect(screen.getByText('Buy certified gluten-free')).toBeOnTheScreen();
    expect(screen.getByTestId('caveat').props.accessibilityLabel).toBe('Buy certified gluten-free');
  });

  it('the compact form truncates to one line, the full form does not', async () => {
    await render(
      <LabelCaveat text="Check the label: certified GF stock and oats" compact testID="compact" />,
    );
    expect(
      screen.getByText('Check the label: certified GF stock and oats').props.numberOfLines,
    ).toBe(1);

    await render(<LabelCaveat text="Check the label: certified GF stock and oats" testID="full" />);
    expect(
      screen.getByText('Check the label: certified GF stock and oats').props.numberOfLines,
    ).toBeUndefined();
  });
});
