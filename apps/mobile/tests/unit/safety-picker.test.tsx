import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { SafetyPickerValue } from '@chefer/utils';
import { SafetyPicker } from '../../src/features/safety/safety-picker';

// T-01.7 — structured entry with read-back, "Something else" recogniser
// outcomes, kept notes (UX-01 AC1, AC2, AC12; UX-22 AC1).

function Controlled({ initial }: { initial: SafetyPickerValue }) {
  const [value, setValue] = useState(initial);
  return <SafetyPicker value={value} onChange={setValue} testIDPrefix="p" />;
}

const EMPTY: SafetyPickerValue = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

describe('SafetyPicker (T-01.7)', () => {
  it('selecting Tree nuts shows the read-back and its may-contain list (AC1)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.press(screen.getByText('Tree nuts'));
    expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(/granola, muesli/);
  });

  it('deselecting an allergy removes its read-back line', async () => {
    await render(<Controlled initial={{ ...EMPTY, allergies: ['Tree nuts'] }} />);
    expect(screen.getByTestId('p-allergies-readback')).toBeTruthy();
    const [treeNutsChip] = screen.getAllByText('Tree nuts');
    if (!treeNutsChip) throw new Error('Tree nuts chip not found');
    await fireEvent.press(treeNutsChip);
    expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(/No allergies selected\./);
  });

  it('vegan greys out dairy-free with a hint', async () => {
    await render(<Controlled initial={{ ...EMPTY, dietaryRestrictions: ['Vegan'] }} />);
    expect(screen.getByText('Vegan already excludes dairy')).toBeTruthy();
  });

  it('typing "walnut" in Something else selects Tree nuts (AC2)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'walnut');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-added-message')).toHaveTextContent(
      'Added to Allergies: Tree nuts.',
    );
    expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(/granola, muesli/);
  });

  it('typing "no eggs" with no base diet adds the Egg-free modifier, not Vegetarian (AC2)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'no eggs');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-added-message')).toHaveTextContent('Added Egg-free to your diet.');
  });

  it('typing "no eggs" with Vegetarian already chosen sets Vegetarian, no eggs (AC2)', async () => {
    await render(<Controlled initial={{ ...EMPTY, dietaryRestrictions: ['Vegetarian'] }} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'no eggs');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-added-message')).toHaveTextContent(
      'Set your diet to Vegetarian, no eggs.',
    );
  });

  it('typing "pre-diabetes" shows the UX-22 condition notice and saves nothing (AC2)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'pre-diabetes');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-unchecked-notice')).toBeTruthy();
    expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(/No allergies selected\./);
  });

  it('typing "zzz" shows the unchecked notice; Keep as a note adds it as a muted chip (AC2)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'zzz');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-unchecked-notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('p-unchecked-notice-keep-note'));
    expect(screen.getByTestId('p-note-zzz')).toBeTruthy();
  });

  it('typing "coeliac" sets the gluten-free-coeliac diet automatically (T-22.1)', async () => {
    await render(<Controlled initial={EMPTY} />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'coeliac');
    await fireEvent.press(screen.getByTestId('p-something-else-add'));
    expect(screen.getByTestId('p-added-message')).toHaveTextContent(
      'Set your diet to Gluten-free (coeliac).',
    );
  });

  it('a chip carries a checkbox role and its selected state (AC12)', async () => {
    await render(<Controlled initial={{ ...EMPTY, allergies: ['Tree nuts'] }} />);
    const chip = screen.getByRole('button', { name: 'Tree nuts' }).props as {
      accessibilityState?: { selected?: boolean };
    };
    expect(chip.accessibilityState?.selected).toBe(true);
  });

  // UX-ACC-06 follow-up: Crustaceans and Molluscs replace the legacy Shellfish chip for new picks.
  describe('legacy Shellfish allergy chip', () => {
    it('is not offered to a user who has not picked it', async () => {
      await render(<Controlled initial={EMPTY} />);
      const allergies = within(screen.getByTestId('p-allergies'));
      expect(allergies.queryByText('Shellfish')).toBeNull();
      expect(allergies.getByText('Crustaceans')).toBeTruthy();
      expect(allergies.getByText('Molluscs')).toBeTruthy();
    });

    it('stays visible, selected and removable for a user who already has it', async () => {
      await render(<Controlled initial={{ ...EMPTY, allergies: ['Shellfish'] }} />);
      const allergies = within(screen.getByTestId('p-allergies'));
      expect(allergies.getByText('Shellfish')).toBeTruthy();
      expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(/Shellfish\./);
      await fireEvent.press(allergies.getByText('Shellfish'));
      expect(screen.getByTestId('p-allergies-readback')).toHaveTextContent(
        /No allergies selected\./,
      );
      expect(within(screen.getByTestId('p-allergies')).queryByText('Shellfish')).toBeNull();
    });
  });
});
