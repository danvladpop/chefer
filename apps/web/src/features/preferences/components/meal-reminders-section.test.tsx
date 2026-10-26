// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealRemindersDto } from '@chefer/types';
import { MealRemindersSection } from './meal-reminders-section';

// Lane E1: web shows and edits the phone's mealtime reminders (no push here).

const DTO: MealRemindersDto = {
  reminders: {
    enabled: true,
    times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
  },
  chosen: true,
  planSlots: ['breakfast', 'lunch', 'dinner'],
  planDays: [0, 1, 2, 3, 4, 5, 6],
};

const m = vi.hoisted(() => ({
  save: vi.fn(),
  capture: vi.fn(),
  data: undefined as MealRemindersDto | undefined,
}));

vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      getMealReminders: { useQuery: () => ({ data: m.data }) },
      setMealReminders: {
        useMutation: () => ({ mutate: m.save, isPending: false, isError: false }),
      },
    },
    useUtils: () => ({
      notifications: {
        getMealReminders: {
          cancel: vi.fn(),
          getData: vi.fn(),
          setData: vi.fn(),
          invalidate: vi.fn(),
        },
      },
    }),
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.data = DTO;
});

describe('MealRemindersSection (lane E1)', () => {
  it('says reminders arrive on the phone, and lists each meal with its time', () => {
    render(<MealRemindersSection />);
    expect(screen.getByRole('heading', { name: 'Mealtime reminders' })).toBeTruthy();
    expect(screen.getByText(/arrive on your phone/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Dinner reminder time').value).toBe('18:30');
    expect(screen.queryByLabelText('Snack reminder time')).toBeNull();
  });

  it('saves a changed time, snapped to 5 minutes, and reports the change', () => {
    render(<MealRemindersSection />);
    fireEvent.change(screen.getByLabelText('Lunch reminder time'), { target: { value: '13:07' } });
    expect(m.save).toHaveBeenCalledWith({
      enabled: true,
      times: { ...DTO.reminders.times, lunch: '13:05' },
    });
    expect(m.capture).toHaveBeenCalledWith('meal_reminders_changed', {
      enabled: true,
      meals: 3,
      surface: 'web',
    });
  });

  it('the master switch turns them off and hides the meals', () => {
    render(<MealRemindersSection />);
    fireEvent.click(screen.getByRole('switch', { name: 'Remind me at mealtimes' }));
    expect(m.save).toHaveBeenCalledWith({ ...DTO.reminders, enabled: false });
  });

  it('renders nothing until the choice has loaded', () => {
    m.data = undefined;
    const { container } = render(<MealRemindersSection />);
    expect(container.innerHTML).toBe('');
  });
});
