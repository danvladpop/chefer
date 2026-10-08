// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/features/auth/lib/session', () => ({ getSessionUser: vi.fn().mockResolvedValue(null) }));

afterEach(cleanup);

describe('landing page — the shopping list, not the retired pantry (WP-24 / FB7-10)', () => {
  it('advertises a shopping list built from your recipes', async () => {
    render(await HomePage());
    expect(screen.getByText('A shopping list built from your recipes')).toBeTruthy();
  });

  it('no longer promises plans that cook from your pantry', async () => {
    render(await HomePage());
    expect(screen.queryByText(/pantry/i)).toBeNull();
    expect(screen.queryByText(/what you bought/i)).toBeNull();
  });
});
