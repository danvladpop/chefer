// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StepDiet, type StepDietValues } from './step-diet';

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
