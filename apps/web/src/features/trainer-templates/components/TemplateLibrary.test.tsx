// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutTemplateSummaryDto } from '@chefer/types';
import { TemplateLibrary } from './TemplateLibrary';

interface ListQuery {
  isLoading: boolean;
  isError: boolean;
  data: WorkoutTemplateSummaryDto[] | undefined;
  error: unknown;
}

const m = vi.hoisted((): { list: ListQuery } => ({
  list: { isLoading: false, isError: false, data: undefined, error: null },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    trainer: { templates: { list: { useQuery: () => ({ ...m.list, refetch: vi.fn() }) } } },
  },
}));

afterEach(cleanup);

function row(over: Partial<WorkoutTemplateSummaryDto>): WorkoutTemplateSummaryDto {
  return {
    id: 't1',
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    exerciseCount: 5,
    estimatedMin: 48,
    assignedCount: 2,
    outdatedCount: 0,
    updatedAt: '2026-10-12T10:00:00.000Z',
    ...over,
  };
}

function show(data: WorkoutTemplateSummaryDto[]) {
  m.list = { isLoading: false, isError: false, data, error: null };
  render(<TemplateLibrary />);
}

describe('TemplateLibrary', () => {
  it('shows the empty state with New template → /trainer/workouts/new, and one h1', () => {
    show([]);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const empty = screen.getByTestId('template-library-empty');
    expect(empty).toHaveTextContent('No templates yet');
    expect(empty).toHaveTextContent('Build a workout once, give it to any client.');
    expect(within(empty).getByRole('link', { name: 'New template' })).toHaveAttribute(
      'href',
      '/trainer/workouts/new',
    );
  });

  it('lists templates with type, size, minutes, assigned count and the edit date', () => {
    show([row({}), row({ id: 't2', name: 'Mobility', workoutType: null, assignedCount: 0 })]);
    const rows = screen.getAllByTestId('template-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/trainer/workouts/t1');
    expect(rows[0]).toHaveTextContent('Lower body · 5 exercises · ~48 min');
    expect(rows[0]).toHaveTextContent('Assigned to 2 clients');
    expect(rows[0]).toHaveTextContent('Edited 12 Oct');
    expect(rows[1]).toHaveTextContent('Not assigned yet');
    expect(screen.getByRole('link', { name: 'New template' })).toBeInTheDocument();
  });

  it('searches by name and filters by workout type, with a no-match line', () => {
    show([
      row({}),
      row({ id: 't2', name: 'Upper push', workoutType: 'UPPER_BODY' }),
      row({ id: 't3', name: 'Lower body B', workoutType: 'LOWER_BODY' }),
    ]);
    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'upper' } });
    expect(screen.getAllByTestId('template-row')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'zzz' } });
    expect(screen.getByRole('status')).toHaveTextContent('No template matches “zzz”.');
    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: '' } });

    const filter = screen.getByLabelText('Workout type');
    // Only the types in use are offered.
    expect(
      within(filter)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All types', 'Upper body', 'Lower body']);
    fireEvent.change(filter, { target: { value: 'LOWER_BODY' } });
    expect(screen.getAllByTestId('template-row').map((r) => r.getAttribute('href'))).toEqual([
      '/trainer/workouts/t1',
      '/trainer/workouts/t3',
    ]);
  });

  it('shows a skeleton while loading and Retry on error', () => {
    m.list = { isLoading: true, isError: false, data: undefined, error: null };
    render(<TemplateLibrary />);
    expect(screen.getByTestId('template-library-loading')).toBeInTheDocument();
    cleanup();
    m.list = { isLoading: false, isError: true, data: undefined, error: new Error('down') };
    render(<TemplateLibrary />);
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
