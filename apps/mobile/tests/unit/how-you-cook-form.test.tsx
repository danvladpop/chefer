import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PlanShape } from '@chefer/types';
import { HowYouCookForm } from '../../src/features/meal-plan/how-you-cook-form';

// UX-07 §1 (T-07.5): the shared "how you cook" form (onboarding, Settings,
// the Plan settings sheet). Pure controlled component — `onChange` gets the
// next full shape, the caller owns the state.

jest.mock('expo-router', () => ({ Link: 'Link' }));

const baseShape: PlanShape = {
  slots: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
};

describe('HowYouCookForm', () => {
  it('summarises the shape live', async () => {
    await render(<HowYouCookForm shape={baseShape} onChange={jest.fn()} />);
    expect(screen.getByTestId('how-you-cook-summary')).toHaveTextContent(
      'Breakfast, Lunch, Dinner · every day',
    );
  });

  it('toggling a meal chip adds/removes it from slots', async () => {
    const onChange = jest.fn();
    await render(<HowYouCookForm shape={baseShape} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-slot-breakfast'));
    expect(onChange).toHaveBeenCalledWith({
      ...baseShape,
      slots: ['lunch', 'dinner'],
    });
  });

  it('refuses to drop the last meal (validation: pick at least one)', async () => {
    const onChange = jest.fn();
    const oneSlot: PlanShape = { ...baseShape, slots: ['dinner'] };
    await render(<HowYouCookForm shape={oneSlot} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-slot-dinner'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses to drop the last day', async () => {
    const onChange = jest.fn();
    const oneDay: PlanShape = { ...baseShape, days: [0] };
    await render(<HowYouCookForm shape={oneDay} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-day-0'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets a time cap and clears it back to "No limit"', async () => {
    const onChange = jest.fn();
    await render(<HowYouCookForm shape={baseShape} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-time-30'));
    expect(onChange).toHaveBeenCalledWith({ ...baseShape, timeCapMins: 30 });

    onChange.mockClear();
    const capped: PlanShape = { ...baseShape, timeCapMins: 30 };
    const { rerender } = await render(<HowYouCookForm shape={capped} onChange={onChange} />);
    await rerender(<HowYouCookForm shape={capped} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-time-none'));
    expect(onChange).toHaveBeenCalledWith({ ...capped, timeCapMins: null });
  });

  it('sets cooking-for', async () => {
    const onChange = jest.fn();
    await render(<HowYouCookForm shape={baseShape} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('how-you-cook-for-2'));
    expect(onChange).toHaveBeenCalledWith({ ...baseShape, cookingFor: 2 });
  });

  // UX-PLAN-12: a household of 3 read "Cooking for: Just me".
  it('with household members, "Cooking for" is a read-only "You + 2" with Edit table', async () => {
    await render(
      <HowYouCookForm
        shape={{ ...baseShape, cookingFor: 1 }}
        householdMembers={[{ name: 'Mia' }, { name: 'Noah' }]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId('how-you-cook-household-summary')).toHaveTextContent(
      /You \+ 2.*Mia, Noah/,
    );
    expect(screen.getByLabelText('Edit table')).toBeOnTheScreen();
    expect(screen.queryByTestId('how-you-cook-cooking-for')).not.toBeOnTheScreen();
    expect(screen.getByTestId('how-you-cook-summary')).toHaveTextContent(/cooking for 3/);
  });

  it('without members it keeps the Just me / Two of us choice', async () => {
    await render(<HowYouCookForm shape={baseShape} householdMembers={[]} onChange={jest.fn()} />);
    expect(screen.getByTestId('how-you-cook-cooking-for')).toBeOnTheScreen();
    expect(screen.queryByTestId('how-you-cook-household-summary')).not.toBeOnTheScreen();
  });
});
