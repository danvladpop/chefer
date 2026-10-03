// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GymExercisesPage from './page';

// UX-GYM-21 (Create "<query>") and UX-GYM-24 (a failed load has Retry) on the
// web Exercises tab.

const m = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  return { state, refetch: vi.fn(), restore: vi.fn() };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      gym: {
        bootstrap: { invalidate: () => Promise.resolve() },
        library: { invalidate: () => Promise.resolve() },
      },
    }),
    gym: {
      library: {
        restoreCustom: {
          useMutation: () => ({ mutate: m.restore, isPending: false, variables: undefined }),
        },
      },
    },
  },
}));
vi.mock('@/features/gym/shared/gym-toast', () => ({ showGymToast: vi.fn() }));

vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/features/gym/use-gym-bootstrap', () => ({
  useGymBootstrap: () => m.state,
  exerciseImageUrl: () => null,
}));
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

const EXERCISE = {
  ownerId: 'u1',
  aliases: [],
  category: 'ISOLATION',
  movementPattern: 'curl',
  equipment: 'DUMBBELL',
  loadType: 'WEIGHTED',
  primaryMuscles: ['biceps'],
  secondaryMuscles: [],
  images: [],
  archived: false,
};

beforeEach(() => {
  m.refetch.mockClear();
  m.restore.mockClear();
  m.state = {
    data: { library: [] },
    isLoading: false,
    isError: false,
    refetch: m.refetch,
    isRefetching: false,
  };
});
afterEach(cleanup);

describe('GymExercisesPage', () => {
  it('UX-GYM-24: a failed load shows Retry, not "No exercises match"', () => {
    m.state = { ...m.state, data: undefined, isError: true };
    render(<GymExercisesPage />);
    expect(screen.getByTestId('gym-exercises-error')).toBeInTheDocument();
    expect(screen.queryByText(/No exercises match/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(m.refetch).toHaveBeenCalled();
  });

  it('UX-GYM-21: a search with no results offers Create "<query>", pre-filled', () => {
    render(<GymExercisesPage />);
    expect(screen.queryByTestId('exercises-empty-create-from-search')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search exercises' }), {
      target: { value: 'Zercher squat' },
    });
    const link = screen.getByTestId('exercises-empty-create-from-search');
    expect(link).toHaveTextContent('create “Zercher squat”');
    expect(link).toHaveAttribute('href', '/gym/exercises/new?name=Zercher%20squat');
  });

  // UX-GYM-34: an archived custom exercise has a clear way back.
  it('UX-GYM-34: archived custom exercises sit under "Archived" with Restore', () => {
    m.state = {
      ...m.state,
      data: {
        library: [
          { ...EXERCISE, id: 'live', name: 'Live Curl' },
          { ...EXERCISE, id: 'old', name: 'Old Curl', archived: true },
        ],
      },
    };
    render(<GymExercisesPage />);

    expect(screen.queryByText('Old Curl')).toBeNull(); // collapsed, never in the main list
    expect(screen.getByTestId('exercises-archived-toggle')).toHaveTextContent('Archived (1)');
    fireEvent.click(screen.getByTestId('exercises-archived-toggle'));
    expect(screen.getByTestId('exercises-archived-item-old')).toHaveTextContent('Old Curl');

    fireEvent.click(screen.getByTestId('exercises-archived-restore-old'));
    expect(m.restore).toHaveBeenCalledWith({ id: 'old' }, expect.any(Object));
  });
});
