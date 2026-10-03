import { render, screen, userEvent } from '@testing-library/react-native';
import {
  friendlyOutboxError,
  OutboxWaitingCard,
} from '../../src/features/gym/components/outbox-waiting-card';
import { outbox } from '../../src/features/gym/offline/outbox';

// UX-GYM-25: "N waiting · last error · Sync now".

describe('OutboxWaitingCard', () => {
  it('renders nothing when nothing is waiting', async () => {
    await render(<OutboxWaitingCard status={{ pending: 0, lastError: 'x', isFlushing: false }} />);
    expect(screen.queryByTestId('gym-outbox-waiting')).toBeNull();
  });

  it('shows the count, the last error in plain words and a working Sync now', async () => {
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue({
      status: 'ok',
      applied: 0,
      stale: 0,
      parked: 0,
      failed: 0,
    });
    const user = userEvent.setup();
    await render(
      <OutboxWaitingCard
        status={{ pending: 2, lastError: 'Network request failed', isFlushing: false }}
      />,
    );

    expect(screen.getByTestId('gym-outbox-waiting-count')).toHaveTextContent(
      '2 workouts waiting to sync',
    );
    expect(screen.getByTestId('gym-outbox-waiting-error')).toHaveTextContent(
      /Can't reach Chefer right now/,
    );
    await user.press(screen.getByTestId('gym-outbox-waiting-sync-now'));
    expect(flush).toHaveBeenCalledWith({ force: true });
    flush.mockRestore();
  });

  it('never shows raw server or Zod text', () => {
    expect(friendlyOutboxError('Unexpected token < in JSON at position 0')).toMatch(
      /went wrong on our side/,
    );
    expect(
      friendlyOutboxError(
        '[{"code":"too_big","maximum":1000,"path":["exercises",0,"sets",0,"weightKg"]}]',
      ),
    ).toMatch(/weight is above/);
  });
});
