import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CollapsibleChipFilters } from '../../src/features/gym/library/collapsible-chip-filters';

// UX-GYM-08: on Android a `LinearTransition` on the chip container drew the
// chips over the search box. The container must carry no layout transition,
// collapsed or not; the rows still render in both modes.

const rows = [<Text key="a">Chest</Text>, <Text key="b">Mine</Text>];

describe('CollapsibleChipFilters', () => {
  it.each([false, true])(
    'has no layout transition on the container (collapsed=%s)',
    async (collapsed) => {
      await render(<CollapsibleChipFilters testID="chips" collapsed={collapsed} rows={rows} />);

      const container = screen.getByTestId('chips');
      expect(container.props.layout).toBeUndefined();
      expect(screen.getByText('Chest')).toBeOnTheScreen();
      expect(screen.getByText('Mine')).toBeOnTheScreen();
    },
  );
});
