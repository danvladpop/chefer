import { render, screen, userEvent } from '@testing-library/react-native';
import {
  CalorieGauge,
  DayStrip,
  EntryCard,
  MacroRow,
  MacroTiles,
  MediaRow,
  MediaTile,
  StatTile,
  Text,
  TileGrid,
} from '@chefer/ui-mobile';

// 10 Oct redesign primitives (docs/design/feedback/2026-10-10). RNTL v14:
// render is async — always await it.

describe('CalorieGauge', () => {
  it('says eaten, target and what is left in one sentence', async () => {
    await render(<CalorieGauge value={560} target={2100} testID="gauge" />);
    expect(screen.getByTestId('gauge').props.accessibilityLabel).toBe(
      '560 of 2,100 kcal eaten, 1,540 left',
    );
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('2,100')).toBeTruthy();
  });

  it('says "over" (in words, not only colour) past the target', async () => {
    await render(<CalorieGauge value={2300} target={2100} testID="gauge" />);
    expect(screen.getByTestId('gauge').props.accessibilityLabel).toContain('200 over');
    expect(screen.getByText('over')).toBeTruthy();
    expect(screen.getByTestId('gauge-left')).toHaveTextContent('200');
  });

  it('shows just the number without a target', async () => {
    await render(<CalorieGauge value={800} target={0} testID="gauge" />);
    expect(screen.queryByText('target')).toBeNull();
  });
});

describe('MacroRow / MacroTiles', () => {
  it('reads the macro name with its value; the emoji is hidden from screen readers', async () => {
    await render(<MacroRow macro="protein" value={82} target={140} testID="p" />);
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('Protein, 82 of 140 grams');
    expect(screen.queryByText('🍖')).toBeNull();
    const emoji = screen.getByText('🍖', { includeHiddenElements: true });
    expect(emoji.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByText('Protein')).toBeTruthy();
  });

  it('labels an over-target macro in words', async () => {
    await render(<MacroRow macro="fat" value={74} target={70} testID="f" />);
    expect(screen.getByTestId('f-over')).toHaveTextContent('4 g over');
    expect(screen.getByTestId('f').props.accessibilityLabel).toBe('Fat, 74 of 70 grams, 4 over');
  });

  it('renders three labelled tiles', async () => {
    await render(<MacroTiles protein={162} carbs={230} fat={75} />);
    expect(screen.getByLabelText('Protein, 162 grams')).toBeTruthy();
    expect(screen.getByLabelText('Carbs, 230 grams')).toBeTruthy();
    expect(screen.getByLabelText('Fat, 75 grams')).toBeTruthy();
  });
});

describe('MediaTile / MediaRow / TileGrid', () => {
  it('speaks label, title and meta, and keeps the action its own button', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    const onSwap = jest.fn();
    await render(
      <TileGrid>
        <MediaTile
          testID="tile"
          label="Lunch"
          title="Chicken & Chickpea Bowl"
          meta="640 kcal · 25 min"
          onPress={onPress}
          action={<Text onPress={onSwap}>swap</Text>}
        />
      </TileGrid>,
    );
    await user.press(screen.getByLabelText('Lunch, Chicken & Chickpea Bowl, 640 kcal · 25 min'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await user.press(screen.getByText('swap'));
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('reads a row with its badge', async () => {
    await render(
      <MediaRow title="Legs" badge="🏆 PR" meta="Wed 7 Oct · 61 min" onPress={jest.fn()} />,
    );
    expect(screen.getByLabelText('Legs, 🏆 PR, Wed 7 Oct · 61 min')).toBeTruthy();
  });
});

describe('StatTile', () => {
  it('reads label and value with unit', async () => {
    await render(<StatTile value="56" unit="min" label="Duration" testID="s" />);
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('Duration: 56 min');
  });
});

describe('EntryCard', () => {
  it('opens the collection and adds from the pill', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    const onAdd = jest.fn();
    await render(
      <EntryCard
        testID="cookbook"
        icon={null}
        title="Cookbook"
        subtitle="Your recipes and saves"
        onPress={onPress}
        addLabel="Recipe"
        addAccessibilityLabel="New recipe"
        onAdd={onAdd}
      />,
    );
    await user.press(screen.getByLabelText('Cookbook, Your recipes and saves'));
    await user.press(screen.getByLabelText('New recipe'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('DayStrip', () => {
  it('marks the selected day and today, and reports picks', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    await render(
      <DayStrip
        testID="days"
        selectedKey="5"
        onSelect={onSelect}
        days={[
          {
            key: '5',
            weekday: 'Sat',
            date: 10,
            accessibilityLabel: 'Saturday 10 October',
            isToday: true,
          },
          { key: '6', weekday: 'Sun', date: 11, accessibilityLabel: 'Sunday 11 October' },
        ]}
      />,
    );
    const sat = screen.getByLabelText('Saturday 10 October, today');
    expect(sat.props.accessibilityState).toMatchObject({ selected: true });
    await user.press(screen.getByLabelText('Sunday 11 October'));
    expect(onSelect).toHaveBeenCalledWith('6');
  });
});
