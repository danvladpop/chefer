// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepDiet, type StepDietHandle, type StepDietValues } from './step-diet';

afterEach(cleanup);

const EMPTY: StepDietValues = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

function Controlled({ initial }: { initial: StepDietValues }) {
  const [value, setValue] = useState(initial);
  return <StepDiet value={value} onChange={setValue} />;
}

describe('StepDiet / SafetyPicker (T-01.7)', () => {
  it('selecting Tree nuts shows the read-back and its may-contain list (AC1)', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tree nuts' }));
    expect(screen.getByText(/granola, muesli/)).toBeTruthy();
  });

  it('deselecting an allergy removes its read-back line', () => {
    render(<Controlled initial={{ ...EMPTY, allergies: ['Tree nuts'] }} />);
    expect(screen.getByText(/granola, muesli/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tree nuts' }));
    expect(screen.getByText('No allergies selected.')).toBeTruthy();
  });

  it('vegan greys out dairy-free with a hint', () => {
    render(<Controlled initial={{ ...EMPTY, dietaryRestrictions: ['Vegan'] }} />);
    expect(screen.getByText('Vegan already excludes dairy')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Dairy-free' }).getAttribute('disabled')).toBe('');
  });

  it('typing "walnut" in Something else selects Tree nuts (AC2)', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'walnut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Added to Allergies: Tree nuts.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Tree nuts' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('typing "no eggs" with no base diet adds the Egg-free modifier, not Vegetarian (AC2)', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'no eggs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Added Egg-free to your diet.')).toBeTruthy();
  });

  it('typing "no eggs" with Vegetarian already chosen sets Vegetarian, no eggs (AC2)', () => {
    render(<Controlled initial={{ ...EMPTY, dietaryRestrictions: ['Vegetarian'] }} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'no eggs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Set your diet to Vegetarian, no eggs.')).toBeTruthy();
  });

  it('typing "pre-diabetes" shows the UX-22 condition notice and saves nothing (AC2)', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.change(screen.getByLabelText('Something else?'), {
      target: { value: 'pre-diabetes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('No allergies selected.')).toBeTruthy();
  });

  it('typing "zzz" shows the unchecked notice; Keep as a note adds it as a muted chip', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as a note' }));
    expect(screen.getByRole('button', { name: 'Remove note zzz' })).toBeTruthy();
  });

  it('typing "coeliac" sets the gluten-free-coeliac diet automatically (T-22.1)', () => {
    render(<Controlled initial={EMPTY} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'coeliac' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Set your diet to Gluten-free (coeliac).')).toBeTruthy();
  });
});

// UX-ACC-01: a term typed in "Something else?" but never confirmed with "Add"
// used to be dropped on Save. Hosts flush the picker first and save what it returns.
describe('StepDiet.flush (UX-ACC-01)', () => {
  function Host({ onSave }: { onSave: (value: StepDietValues) => void }) {
    const ref = useRef<StepDietHandle>(null);
    const [value, setValue] = useState(EMPTY);
    return (
      <>
        <StepDiet ref={ref} value={value} onChange={setValue} />
        <button
          onClick={() => {
            const flushed = ref.current ? ref.current.flush() : value;
            if (flushed !== null) onSave(flushed);
          }}
        >
          Save
        </button>
      </>
    );
  }

  it('adds a recognised typed term ("sesame") to what Save receives', () => {
    const onSave = vi.fn<[StepDietValues], undefined>();
    render(<Host onSave={onSave} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Peanuts' }));
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
    expect(screen.getByLabelText<HTMLInputElement>('Something else?').value).toBe('');
  });

  it('holds Save back on an unrecognised term and says what to do', () => {
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'zzqqxx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('safety-save-blocked').textContent).toContain('zzqqxx');

    fireEvent.click(screen.getByRole('button', { name: /Keep as a note/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSave.mock.calls[0])).toContain('zzqqxx');
  });

  it('saves the value untouched when nothing is typed', () => {
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Peanuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ ...EMPTY, allergies: ['Peanuts'] });
  });
});
