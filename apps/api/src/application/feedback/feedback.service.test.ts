import { describe, expect, it, vi } from 'vitest';
import { FeedbackService } from './feedback.service.js';

describe('FeedbackService.submit', () => {
  it('trims and stores the message with the sending path', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const service = new FeedbackService(repo);

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
    const service = new FeedbackService(repo);

    await expect(service.submit('user1', '   ')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('caps oversized messages at 2000 chars', async () => {
    const repo = { create: vi.fn().mockResolvedValue({ id: 'f1' }) };
    const service = new FeedbackService(repo);

    await service.submit('user1', 'x'.repeat(3000));

    const stored = repo.create.mock.calls[0]![0] as { message: string };
    expect(stored.message).toHaveLength(2000);
  });
});
