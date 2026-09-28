// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableSafety } from '@chefer/types';
import { WhatWeCheckSheet } from './WhatWeCheckSheet';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@chefer/ui', () => ({
  Sheet: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: unknown;
    footer?: unknown;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children as never}
        {footer as never}
      </div>
    ) : null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TABLE: TableSafety = {
  people: [
    {
      who: 'you',
      isOwner: true,
      items: [{ id: 'vegetarian', label: 'Vegetarian', kind: 'diet' }],
      notes: [],
    },
    {
      who: 'Luca',
      isOwner: false,
      items: [{ id: 'tree-nuts', label: 'Tree nuts', kind: 'allergy' }],
      notes: ['low sugar'],
    },
  ],
  hasRules: true,
  needsReview: false,
};

describe('WhatWeCheckSheet (UX-02)', () => {
  it('lists every person and their rules, and notes what cannot be checked', () => {
    render(<WhatWeCheckSheet open table={TABLE} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Checked for your table' })).toBeTruthy();
    expect(screen.getByText('Vegetarian')).toBeTruthy();
    expect(screen.getByText(/Tree nuts, .low sugar. \(a note\)/)).toBeTruthy();
  });

  it('the footer action closes the sheet and opens Settings', () => {
    const onClose = vi.fn();
    render(<WhatWeCheckSheet open table={TABLE} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit allergies & diets' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/preferences');
  });

  it('a row calls onEditPerson with that person', () => {
    const onEditPerson = vi.fn();
    render(<WhatWeCheckSheet open table={TABLE} onClose={vi.fn()} onEditPerson={onEditPerson} />);
    fireEvent.click(screen.getByText('Luca'));
    expect(onEditPerson).toHaveBeenCalledWith(TABLE.people[1]);
  });
});
