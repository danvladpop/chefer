import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CollapsibleChipFilters } from '../../src/features/gym/library/collapsible-chip-filters';

// FB7-07: the filters are ONE horizontally scrolling row (no stacked rows, no
// keyboard collapse). UX-GYM-08: the container carries no layout transition.

describe('CollapsibleChipFilters', () => {
  it('renders every chip in a single horizontal scroller with no layout transition', async () => {
    await render(
      <CollapsibleChipFilters testID="chips">
        <Text>Equipment</Text>
        <Text>Mine</Text>
        <Text>Chest</Text>
      </CollapsibleChipFilters>,
    );

    const container = screen.getByTestId('chips');
    expect(container.props.layout).toBeUndefined();
    expect(screen.getByTestId('chips-scroll').props.horizontal).toBe(true);
    expect(screen.getByText('Equipment')).toBeOnTheScreen();
    expect(screen.getByText('Mine')).toBeOnTheScreen();
    expect(screen.getByText('Chest')).toBeOnTheScreen();
  });
});
