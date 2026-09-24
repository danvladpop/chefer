import { describe, expect, it } from 'vitest';
import type { Muscle } from '@chefer/types';
import { removeMuscle, toggleMuscle } from './muscle-select';

describe('toggleMuscle', () => {
  it('adds a muscle that is not yet in the list', () => {
    expect(toggleMuscle(['chest'], 'triceps', 4)).toEqual(['chest', 'triceps']);
  });

  it('removes a muscle already in the list', () => {
    expect(toggleMuscle(['chest', 'triceps'], 'chest', 4)).toEqual(['triceps']);
  });

  it('refuses to add past the cap', () => {
    const list: Muscle[] = ['chest', 'triceps', 'front-delts', 'abs'];
    expect(toggleMuscle(list, 'biceps', 4)).toEqual(list);
  });

  it('always allows removing, even at the cap', () => {
    const list: Muscle[] = ['chest', 'triceps', 'front-delts', 'abs'];
    expect(toggleMuscle(list, 'chest', 4)).toEqual(['triceps', 'front-delts', 'abs']);
  });
});

describe('removeMuscle', () => {
  it('drops the given muscle and leaves the rest', () => {
    expect(removeMuscle(['chest', 'triceps'], 'chest')).toEqual(['triceps']);
  });

  it('is a no-op when the muscle is absent', () => {
    expect(removeMuscle(['chest'], 'biceps')).toEqual(['chest']);
  });
});
