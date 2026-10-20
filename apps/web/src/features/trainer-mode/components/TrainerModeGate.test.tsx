// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainerModeGate } from './TrainerModeGate';

const m = vi.hoisted(() => ({
  replace: vi.fn(),
  mode: { trainerModeAvailable: false, trainerModeLoading: false, switching: false },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: m.replace }) }));
vi.mock('@/features/nav/mode-context', () => ({ useAppMode: () => m.mode }));

beforeEach(() => m.replace.mockClear());
afterEach(cleanup);

function renderGate() {
  render(
    <TrainerModeGate title="Clients">
      <p>content</p>
    </TrainerModeGate>,
  );
}

describe('TrainerModeGate', () => {
  it('renders the page while trainer mode is available', () => {
    m.mode = { trainerModeAvailable: true, trainerModeLoading: false, switching: false };
    renderGate();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(m.replace).not.toHaveBeenCalled();
  });

  it('waits, with the page h1, while availability is loading', () => {
    m.mode = { trainerModeAvailable: false, trainerModeLoading: true, switching: false };
    renderGate();
    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(screen.queryByText('content')).toBeNull();
    expect(m.replace).not.toHaveBeenCalled();
  });

  it('hands over to /trainer (turn-on / not available) without trainer mode', () => {
    m.mode = { trainerModeAvailable: false, trainerModeLoading: false, switching: false };
    renderGate();
    expect(m.replace).toHaveBeenCalledWith('/trainer');
  });

  it('lets a switch in flight finish (turning tools off lands on Food)', () => {
    m.mode = { trainerModeAvailable: false, trainerModeLoading: false, switching: true };
    renderGate();
    expect(m.replace).not.toHaveBeenCalled();
  });
});
