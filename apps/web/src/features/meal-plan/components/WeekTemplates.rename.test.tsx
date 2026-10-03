// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekTemplates } from './WeekTemplates';

// UX-PLAN-10: renaming a saved week can be cancelled, shows the 40-character
// cap, and Enter saves.

const m = vi.hoisted(() => ({ rename: vi.fn(), reset: vi.fn() }));

vi.mock('@/lib/trpc', () => {
  const idle = { isPending: false, isError: false, error: null, mutate: vi.fn(), reset: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        mealPlan: {
          listTemplates: { invalidate: vi.fn() },
          getForWeek: { invalidate: vi.fn() },
        },
        dashboard: { summary: { invalidate: vi.fn() } },
        tracker: { invalidate: vi.fn() },
        shoppingList: { invalidate: vi.fn() },
      }),
      mealPlan: {
        listTemplates: {
          useQuery: () => ({
            data: [
              {
                id: 't1',
                name: 'Busy week',
                mealsCount: 12,
                previewNames: ['Soup'],
                isFollowed: false,
              },
            ],
          }),
        },
        saveAsTemplate: { useMutation: () => idle },
        followTemplate: { useMutation: () => idle },
        unfollowTemplate: { useMutation: () => idle },
        renameTemplate: { useMutation: () => ({ ...idle, mutate: m.rename, reset: m.reset }) },
        deleteTemplate: { useMutation: () => idle },
      },
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WeekTemplates rename (UX-PLAN-10)', () => {
  it('shows the 40-character counter and Cancel leaves the name untouched', () => {
    render(<WeekTemplates currentPlanId="p1" />);
    fireEvent.click(screen.getByLabelText('Rename Busy week'));
    expect(screen.getByTestId('rename-count').textContent).toBe('9/40');
    expect(screen.getByLabelText('New name for Busy week').getAttribute('maxlength')).toBe('40');
    fireEvent.change(screen.getByLabelText('New name for Busy week'), {
      target: { value: 'Busy week!' },
    });
    expect(screen.getByTestId('rename-count').textContent).toBe('10/40');
    fireEvent.click(screen.getByLabelText('Cancel rename'));
    expect(screen.queryByLabelText('New name for Busy week')).toBeNull();
    expect(screen.getByText('Busy week')).toBeTruthy();
    expect(m.rename).not.toHaveBeenCalled();
    expect(m.reset).toHaveBeenCalled();
  });

  it('saves on Enter', () => {
    render(<WeekTemplates currentPlanId="p1" />);
    fireEvent.click(screen.getByLabelText('Rename Busy week'));
    const input = screen.getByLabelText('New name for Busy week');
    fireEvent.change(input, { target: { value: 'Light week' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(m.rename).toHaveBeenCalledWith({ templateId: 't1', name: 'Light week' });
  });
});
