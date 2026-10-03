import { describe, expect, it, vi } from 'vitest';
import { EmailFeedbackNotifier } from './feedback-notifier.js';

const note = {
  userId: 'u1',
  userEmail: 'tester@chefer.dev',
  message: 'The rest timer\nis silent',
  context: '/gym/workout · iOS 18.2 · Chefer 1.0.1',
  createdAt: new Date('2026-10-03T10:00:00Z'),
};

describe('EmailFeedbackNotifier', () => {
  it('mails the message, sender and context to FEEDBACK_NOTIFY_EMAIL', async () => {
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    await new EmailFeedbackNotifier(email, 'owner@chefer.dev').notify(note);

    const sent = email.send.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(sent.to).toBe('owner@chefer.dev');
    expect(sent.subject).toBe('[Chefer feedback] The rest timer is silent');
    expect(sent.text).toContain('tester@chefer.dev');
    expect(sent.text).toContain('/gym/workout · iOS 18.2 · Chefer 1.0.1');
  });

  it('is a no-op when no address is configured', async () => {
    const email = { send: vi.fn() };
    await new EmailFeedbackNotifier(email, undefined).notify(note);
    expect(email.send).not.toHaveBeenCalled();
  });
});
