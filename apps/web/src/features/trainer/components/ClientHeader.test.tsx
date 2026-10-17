// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientHeader } from './ClientHeader';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('ClientHeader', () => {
  it('shows the Keep it simple badge and says only the client can change it', () => {
    render(<ClientHeader clientId="c1" name="Maria Popescu" active="workouts" keepItSimple />);
    expect(screen.getByTestId('trainer-client-simple')).toHaveTextContent('Keep it simple');
    expect(screen.getByTestId('trainer-client-simple-hint')).toHaveTextContent(
      'Maria chose “Keep it simple”: they tick exercises off instead of logging weights. Only Maria can change this.',
    );
  });

  it('has no control to change the training style: only the back link and the tabs', () => {
    render(<ClientHeader clientId="c1" name="Maria Popescu" active="workouts" keepItSimple />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      '',
      'Routine',
      'Workouts',
      'Adherence',
    ]);
    expect(screen.queryByText(/Track my progress/)).toBeNull();
  });

  it('shows neither badge nor hint for a client who tracks progress', () => {
    render(<ClientHeader clientId="c1" name="Ion" active="routine" />);
    expect(screen.queryByTestId('trainer-client-simple')).toBeNull();
    expect(screen.queryByTestId('trainer-client-simple-hint')).toBeNull();
  });
});
