// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROGRAM_TEMPLATES, type TemplateSummaryDto } from '@chefer/types';
import { CreateRoutineSheet } from './CreateRoutineSheet';

afterEach(cleanup);
vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());

const first = PROGRAM_TEMPLATES[0];
if (!first) throw new Error('no program templates');
const TEMPLATES: TemplateSummaryDto[] = [
  {
    key: first.key,
    name: first.name,
    daysPerWeek: first.daysPerWeek,
    experience: first.experience,
    description: first.description,
  },
];

function renderSheet(props: Partial<React.ComponentProps<typeof CreateRoutineSheet>> = {}) {
  const onCreateFromTemplate = vi.fn();
  render(
    <CreateRoutineSheet
      open
      onClose={vi.fn()}
      templates={TEMPLATES}
      onCreateFromTemplate={onCreateFromTemplate}
      onCreateBlank={vi.fn()}
      {...props}
    />,
  );
  return onCreateFromTemplate;
}

describe('CreateRoutineSheet template preview (UX-GYM-14)', () => {
  it('choosing a template previews it day by day and creates nothing yet', () => {
    const onCreate = renderSheet({ hasActive: true, currentGoal: first.daysPerWeek + 1 });
    fireEvent.click(screen.getByTestId(`template-option-${first.key}`));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('template-preview-day-0')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^template-preview-day-/)).toHaveLength(first.days.length);
    expect(screen.getByTestId('template-preview-switch-note')).toHaveTextContent(
      `from ${String(first.daysPerWeek + 1)} to ${String(first.daysPerWeek)}`,
    );
  });

  it('with an active routine: "Create and switch" activates, "Create" keeps the current one', () => {
    const onCreate = renderSheet({ hasActive: true, currentGoal: first.daysPerWeek });
    fireEvent.click(screen.getByTestId(`template-option-${first.key}`));
    fireEvent.click(screen.getByRole('button', { name: 'Create and switch' }));
    expect(onCreate).toHaveBeenLastCalledWith(first.key, true);
    fireEvent.click(screen.getByTestId('template-create'));
    expect(onCreate).toHaveBeenLastCalledWith(first.key, false);
  });

  it('with no active routine there is a single "Create" that makes it active', () => {
    const onCreate = renderSheet({ hasActive: false });
    fireEvent.click(screen.getByTestId(`template-option-${first.key}`));
    expect(screen.queryByTestId('template-preview-switch-note')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create and switch' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith(first.key, true);
  });

  it('"All templates" goes back to the list', () => {
    renderSheet({ hasActive: true });
    fireEvent.click(screen.getByTestId(`template-option-${first.key}`));
    fireEvent.click(screen.getByTestId('template-back'));
    expect(screen.getByTestId(`template-option-${first.key}`)).toBeInTheDocument();
  });
});
