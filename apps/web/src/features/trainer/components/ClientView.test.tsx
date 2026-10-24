// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientView } from './ClientView';

const m = vi.hoisted(() => ({ trainerModeAvailable: false }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/nav/mode-context', () => ({
  useOptionalAppMode: () => ({ trainerModeAvailable: m.trainerModeAvailable }),
  useTrainerClientsHref: () => '/trainer',
}));
vi.mock('../use-client-overview', () => ({
  isClientUnavailable: () => false,
  useClientOverview: () => ({
    isError: false,
    data: { client: { name: 'Maria Pop', keepItSimple: false }, adherence: null },
  }),
}));
vi.mock('./WorkoutsTab', () => ({ WorkoutsTab: () => null }));
vi.mock('./PrivateNotesPanel', () => ({ PrivateNotesPanel: () => null }));
vi.mock('./RemoveClientButton', () => ({ RemoveClientButton: () => null }));
vi.mock('./WeekSummaryCard', () => ({ WeekSummaryCard: () => null }));
vi.mock('@/features/trainer-templates/components/AssignFromClientButton', () => ({
  AssignFromClientButton: ({ clientId }: { clientId: string }) => (
    <button type="button" data-client={clientId}>
      Assign a template
    </button>
  ),
}));

afterEach(cleanup);

describe('ClientView header actions', () => {
  it('offers "Assign a template" only in trainer mode', () => {
    m.trainerModeAvailable = false;
    render(<ClientView clientId="c1" tab="workouts" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Maria Pop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign a template' })).toBeNull();
    cleanup();

    m.trainerModeAvailable = true;
    render(<ClientView clientId="c1" tab="workouts" />);
    expect(screen.getByRole('button', { name: 'Assign a template' })).toHaveAttribute(
      'data-client',
      'c1',
    );
  });
});
