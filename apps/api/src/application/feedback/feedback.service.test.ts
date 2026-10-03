import { describe, expect, it, vi } from 'vitest';
import type { IFeedbackNotifier } from './feedback-notifier.js';
import { FeedbackService, formatFeedbackContext } from './feedback.service.js';

const silentNotifier = (): IFeedbackNotifier => ({ notify: vi.fn().mockResolvedValue(undefined) });

describe('FeedbackService.submit', () => {
  it('trims and stores the message with the sending path', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const service = new FeedbackService(repo, silentNotifier());

    const result = await service.submit('user1', '  the planner is great  ', '/meal-plan');

    expect(result).toEqual({ ok: true });
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user1',
      message: 'the planner is great',
      path: '/meal-plan',
    });
  });

  it('rejects whitespace-only messages with BAD_REQUEST', async () => {
    const repo = { create: vi.fn() };
    const notifier = silentNotifier();
    const service = new FeedbackService(repo, notifier);

    await expect(service.submit('user1', '   ')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.create).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('caps oversized messages at 2000 chars', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const service = new FeedbackService(repo, silentNotifier());

    await service.submit('user1', 'x'.repeat(3000));

    const stored = repo.create.mock.calls[0]![0] as { message: string };
    expect(stored.message).toHaveLength(2000);
  });

  it('stores the route, OS and build as one context line (UX-PO-05)', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const service = new FeedbackService(repo, silentNotifier());

    await service.submit('user1', 'crash', 'mobile/more', {
      route: '/gym/workout',
      os: 'iOS 18.2',
      build: 'Chefer 1.0.1 · production · update 3f2a9c1e',
    });

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user1',
      message: 'crash',
      path: '/gym/workout · iOS 18.2 · Chefer 1.0.1 · production · update 3f2a9c1e',
    });
  });

  it('notifies the owner with the stored context and the sender email', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const notifier = silentNotifier();
    const service = new FeedbackService(repo, notifier);

    await service.submit('user1', ' hi ', null, { os: 'Android 14' }, { email: 'a@b.dev' });

    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user1',
        userEmail: 'a@b.dev',
        message: 'hi',
        context: 'Android 14',
      }),
    );
  });

  it('still succeeds when the notification fails', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const notifier: IFeedbackNotifier = {
      notify: vi.fn().mockRejectedValue(new Error('smtp down')),
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new FeedbackService(repo, notifier);

    await expect(service.submit('user1', 'hello')).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());
    errorLog.mockRestore();
  });
});

describe('formatFeedbackContext', () => {
  it('is null with nothing to record, and keeps the legacy path alone', () => {
    expect(formatFeedbackContext(null)).toBeNull();
    expect(formatFeedbackContext('/tracker')).toBe('/tracker');
  });

  it('prefers the route over the legacy path and caps the line at 400 chars', () => {
    expect(formatFeedbackContext('mobile/more', { route: '/today' })).toBe('/today');
    expect(formatFeedbackContext(null, { build: 'b'.repeat(500) })).toHaveLength(400);
  });
});
