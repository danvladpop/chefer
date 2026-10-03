// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExercisePickerSheet } from './exercise-picker-sheet';

afterEach(cleanup);
// The Sheet restores the scroll position on close; jsdom has no scrollTo.
vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// UX-GYM-21: a search that finds nothing offers to create it, pre-filled.
describe('ExercisePickerSheet — Create from search', () => {
  it('offers Create "<query>" linking to the pre-filled form when nothing matches', () => {
    render(<ExercisePickerSheet open onClose={vi.fn()} onPick={vi.fn()} library={[]} />);
    expect(screen.queryByTestId('exercise-picker-create-from-search')).toBeNull();

    fireEvent.change(screen.getByTestId('exercise-picker-search'), {
      target: { value: 'Zercher squat' },
    });
    const link = screen.getByTestId('exercise-picker-create-from-search');
    expect(link).toHaveTextContent('Create “Zercher squat”');
    expect(link).toHaveAttribute('href', '/gym/exercises/new?name=Zercher%20squat');
  });

  it('does not offer it for a one-character search', () => {
    render(<ExercisePickerSheet open onClose={vi.fn()} onPick={vi.fn()} library={[]} />);
    fireEvent.change(screen.getByTestId('exercise-picker-search'), { target: { value: 'z' } });
    expect(screen.queryByTestId('exercise-picker-create-from-search')).toBeNull();
  });
});
