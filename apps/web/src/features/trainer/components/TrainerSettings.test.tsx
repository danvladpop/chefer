// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COACHING_COPY, SUPPORT_EMAIL } from '@chefer/types';
import { TrainerSettings } from './TrainerSettings';
import { TrainerTurnOn } from './TrainerTurnOn';

const m = vi.hoisted(() => ({
  update: vi.fn(),
  deactivate: vi.fn(),
  activate: vi.fn(),
}));

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({ trainer: { invalidate, status: { invalidate } } }),
      trainer: {
        updateProfile: { useMutation: () => ({ mutate: m.update, isPending: false }) },
        deactivate: { useMutation: () => ({ mutate: m.deactivate, isPending: false }) },
        activate: { useMutation: () => ({ mutate: m.activate, isPending: false }) },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

beforeEach(() => {
  m.update.mockClear();
  m.deactivate.mockClear();
  m.activate.mockClear();
});
afterEach(cleanup);

const gymLabel = COACHING_COPY.trainerProfile.gymLine;

describe('TrainerTurnOn', () => {
  it('sends the name and the optional gym / city line, and says it makes you findable', () => {
    render(<TrainerTurnOn defaultName="Ana" />);
    expect(screen.getByText(COACHING_COPY.trainerProfile.findableNote)).toBeInTheDocument();
    expect(screen.getByLabelText(gymLabel)).toHaveAccessibleDescription(
      COACHING_COPY.trainerProfile.gymLineHint,
    );
    fireEvent.change(screen.getByLabelText(gymLabel), { target: { value: ' Iron Gym, Cluj ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(m.activate).toHaveBeenCalledWith({ displayName: 'Ana', gymLine: 'Iron Gym, Cluj' });
  });

  it('sends no gym line when it is left empty', () => {
    render(<TrainerTurnOn defaultName="Ana" />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(m.activate).toHaveBeenCalledWith({ displayName: 'Ana', gymLine: null });
  });
});

describe('TrainerSettings', () => {
  it('saves a changed gym line, and clears it when emptied', () => {
    render(<TrainerSettings displayName="Ana" gymLine="Iron Gym" activeClients={0} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(gymLabel), { target: { value: '' } });
    fireEvent.click(save);
    expect(m.update).toHaveBeenCalledWith({ displayName: 'Ana', gymLine: null });
  });

  it('turning off names the number of clients first', () => {
    render(<TrainerSettings displayName="Ana" gymLine={null} activeClients={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off trainer tools' }));
    expect(screen.getByTestId('trainer-turn-off-clients')).toHaveTextContent(
      'Your 3 clients lose you as their trainer at once and keep their routines.',
    );
    expect(m.deactivate).not.toHaveBeenCalled();
  });

  it('without clients the confirmation has no client line', () => {
    render(<TrainerSettings displayName="Ana" gymLine={null} activeClients={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off trainer tools' }));
    expect(screen.queryByTestId('trainer-turn-off-clients')).toBeNull();
    expect(screen.getByText(COACHING_COPY.trainer.turnOffBody)).toBeInTheDocument();
  });

  it('Send feedback is an email to support', () => {
    render(<TrainerSettings displayName="Ana" gymLine={null} activeClients={0} />);
    expect(screen.getByRole('link', { name: 'Send feedback' }).getAttribute('href')).toMatch(
      new RegExp(`^mailto:${SUPPORT_EMAIL.replace('.', '\\.')}\\?subject=`),
    );
  });
});
