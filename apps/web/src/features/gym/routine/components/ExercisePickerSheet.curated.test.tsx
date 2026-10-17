// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseDto } from '@chefer/types';
import { ExercisePickerSheet } from './ExercisePickerSheet';

vi.mock('@/features/gym/library/ExerciseImage', () => ({ ExerciseImage: () => null }));
vi.mock('@/features/gym/use-gym-bootstrap', () => ({ exerciseImageUrl: () => null }));
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

function dto(id: string, name: string, ownerId: string | null): ExerciseDto {
  return {
    id,
    name,
    ownerId,
    category: 'COMPOUND',
    movementPattern: 'squat',
    equipment: 'BARBELL',
    loadType: 'WEIGHTED',
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    repMin: 5,
    repMax: 8,
    restSec: 120,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: true,
    isTimed: false,
    swapGroup: null,
    images: [],
  } as unknown as ExerciseDto;
}

const LIBRARY = [
  dto('back-squat', 'Back Squat', null),
  dto('my-lift', 'My Custom Lift', 'trainer-1'),
];

describe('ExercisePickerSheet curatedOnly (trainer)', () => {
  it("hides the trainer's custom exercises and says why", () => {
    render(
      <ExercisePickerSheet open onClose={vi.fn()} library={LIBRARY} onPick={vi.fn()} curatedOnly />,
    );
    expect(screen.getByText('Back Squat')).toBeInTheDocument();
    expect(screen.queryByText('My Custom Lift')).toBeNull();
    expect(
      screen.getByText('Only Chefer’s exercises can be added to a client’s routine.'),
    ).toBeInTheDocument();
  });

  it('lists custom exercises for the owner as before', () => {
    render(<ExercisePickerSheet open onClose={vi.fn()} library={LIBRARY} onPick={vi.fn()} />);
    expect(screen.getByText('My Custom Lift')).toBeInTheDocument();
    expect(
      screen.queryByText('Only Chefer’s exercises can be added to a client’s routine.'),
    ).toBeNull();
  });
});
