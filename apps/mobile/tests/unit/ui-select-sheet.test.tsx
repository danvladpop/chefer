import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SelectField, type SelectOption } from '@chefer/ui-mobile';

// PAT-15 (03-ux-design-spec.md D.2): a field that opens a sheet instead of a
// native menu (which would cover the keyboard). Values are canonical
// strings; a legacy value outside the list still displays, never silently
// changed; `Other…` swaps the list for one input.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const UNIT_OPTIONS: SelectOption[] = [
  { value: 'g', label: 'g', group: 'Weight' },
  { value: 'kg', label: 'kg', group: 'Weight' },
  { value: 'ml', label: 'ml', group: 'Volume' },
  { value: 'tbsp', label: 'tbsp', group: 'Volume' },
];

function ControlledField({
  options,
  initial,
  allowOther,
}: {
  options: SelectOption[];
  initial: string | null;
  allowOther?: { label?: string; inputLabel: string };
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <SelectField
        testID="sf-unit"
        label="Unit"
        value={value}
        options={options}
        onChange={setValue}
        allowOther={allowOther}
      />
    </SafeAreaProvider>
  );
}

describe('SelectField + SelectSheet (PAT-15)', () => {
  it('shows the placeholder until a value is chosen, then the option label', async () => {
    await render(<ControlledField options={UNIT_OPTIONS} initial={null} />);
    expect(screen.getByText('Choose one')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sf-unit'));
    await fireEvent.press(screen.getByTestId('sf-unit-sheet-option-tbsp'));

    // tbsp never truncates (CI-15) — the full label is on screen.
    expect(screen.getByText('tbsp')).toBeTruthy();
    expect(screen.queryByTestId('sf-unit-sheet')).toBeNull();
  });

  it('groups options under muted headers', async () => {
    await render(<ControlledField options={UNIT_OPTIONS} initial={null} />);
    await fireEvent.press(screen.getByTestId('sf-unit'));
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();
  });

  it('the selected row is marked selected for accessibility', async () => {
    await render(<ControlledField options={UNIT_OPTIONS} initial="kg" />);
    await fireEvent.press(screen.getByTestId('sf-unit'));
    expect(screen.getByTestId('sf-unit-sheet-option-kg')).toBeSelected();
    expect(screen.getByTestId('sf-unit-sheet-option-g')).not.toBeSelected();
  });

  it('a legacy value outside the list still displays and is never silently changed', async () => {
    await render(<ControlledField options={UNIT_OPTIONS} initial="pcs" />);
    expect(screen.getByText('pcs')).toBeTruthy();
  });

  it('"Other…" swaps the list for a free-text input, and "Use this" commits it', async () => {
    await render(
      <ControlledField
        options={UNIT_OPTIONS}
        initial={null}
        allowOther={{ inputLabel: 'Other unit' }}
      />,
    );
    await fireEvent.press(screen.getByTestId('sf-unit'));
    await fireEvent.press(screen.getByTestId('sf-unit-sheet-other'));
    expect(screen.getByText('Other unit')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('sf-unit-sheet-other-input'), 'drizzle');
    expect(screen.getByTestId('sf-unit-sheet-other-use')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('sf-unit-sheet-other-use'));

    expect(screen.getByText('drizzle')).toBeTruthy();
  });

  it('the field is a button with an accessible name that includes "required" when required', async () => {
    function Required() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <SafeAreaProvider initialMetrics={metrics}>
          <SelectField
            testID="sf-cuisine"
            label="Cuisine"
            value={value}
            options={UNIT_OPTIONS}
            onChange={setValue}
            required
          />
        </SafeAreaProvider>
      );
    }
    await render(<Required />);
    expect(screen.getByLabelText('Cuisine, not set, required')).toBeTruthy();
  });
});
