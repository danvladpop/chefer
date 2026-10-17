// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACHING_COPY } from '@chefer/types';
import { ConsentScreen } from './ConsentScreen';

afterEach(cleanup);

function renderScreen(props: Partial<Parameters<typeof ConsentScreen>[0]> = {}) {
  const onAllow = vi.fn();
  const onDecline = vi.fn();
  render(
    <ConsentScreen
      trainerName="Ana"
      currentTrainerName={null}
      busy={false}
      error={null}
      onAllow={onAllow}
      onDecline={onDecline}
      {...props}
    />,
  );
  return { onAllow, onDecline };
}

describe('ConsentScreen', () => {
  it('renders every line of the shared consent copy, with the trainer name', () => {
    renderScreen();
    const c = COACHING_COPY.consent;
    expect(screen.getByRole('heading', { level: 1, name: c.title('Ana') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: c.willSeeHeading('Ana') })).toBeInTheDocument();
    for (const line of c.willSee) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: c.canHeading('Ana') })).toBeInTheDocument();
    for (const line of c.can('Ana')) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText(c.privateNotes('Ana'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: c.neverHeading('Ana') })).toBeInTheDocument();
    expect(screen.getByText(c.never)).toBeInTheDocument();
    expect(screen.getByText(c.oneTrainer('Ana'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: c.allow })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: c.notNow })).toBeInTheDocument();
    expect(screen.queryByTestId('coaching-switch-line')).toBeNull();
  });

  it('allow and not now call their handlers', () => {
    const { onAllow, onDecline } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: COACHING_COPY.consent.allow }));
    fireEvent.click(screen.getByRole('button', { name: COACHING_COPY.consent.notNow }));
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('says who the client stops being coached by and offers Switch', () => {
    renderScreen({ currentTrainerName: 'Ion' });
    expect(screen.getByTestId('coaching-switch-line')).toHaveTextContent(
      COACHING_COPY.consent.switchLine('Ion'),
    );
    expect(screen.getByRole('button', { name: 'Switch to Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COACHING_COPY.consent.allow })).toBeNull();
  });

  it('shows an error as an alert', () => {
    renderScreen({ error: 'Set up your training first, then join.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Set up your training first');
  });
});
