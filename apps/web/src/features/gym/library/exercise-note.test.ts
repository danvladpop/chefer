import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadExerciseNote, saveExerciseNote } from './exercise-note';

// Node test env has no window — a Map-backed stub is enough (same pattern as
// premium/lib/nudge-cap.test.ts).
function installLocalStorageStub() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

describe('exercise note (localStorage, try/catch wrapped)', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns an empty string when nothing was saved', () => {
    expect(loadExerciseNote('barbell-bench-press')).toBe('');
  });

  it('round-trips a saved note', () => {
    saveExerciseNote('barbell-bench-press', 'Pause 1s at the chest.');
    expect(loadExerciseNote('barbell-bench-press')).toBe('Pause 1s at the chest.');
  });

  it('keeps notes for different exercises separate', () => {
    saveExerciseNote('barbell-bench-press', 'Bench note');
    saveExerciseNote('goblet-squat', 'Squat note');
    expect(loadExerciseNote('barbell-bench-press')).toBe('Bench note');
    expect(loadExerciseNote('goblet-squat')).toBe('Squat note');
  });

  it('clears the note when saved as blank', () => {
    saveExerciseNote('barbell-bench-press', 'Something');
    saveExerciseNote('barbell-bench-press', '   ');
    expect(loadExerciseNote('barbell-bench-press')).toBe('');
  });

  it('never throws when window is unavailable (SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => saveExerciseNote('x', 'note')).not.toThrow();
    expect(loadExerciseNote('x')).toBe('');
  });

  it('never throws when storage access itself throws (private browsing)', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      },
    };
    expect(() => saveExerciseNote('x', 'note')).not.toThrow();
    expect(loadExerciseNote('x')).toBe('');
  });
});
