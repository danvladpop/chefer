// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_MAX_LENGTH, FeedbackDialog } from './FeedbackDialog';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate,
          reset: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

afterEach(cleanup);

describe('FeedbackDialog (F-PROF-2-2)', () => {
  it('labels the textarea and links it to a character counter', () => {
    render(<FeedbackDialog open onClose={vi.fn()} />);
    const textarea = screen.getByLabelText('Your feedback');
    const counter = document.getElementById(textarea.getAttribute('aria-describedby') ?? '');
    expect(counter?.textContent).toBe('0 / 2,000');

    fireEvent.change(textarea, { target: { value: 'Great app' } });
    expect(counter?.textContent).toBe('9 / 2,000');
    expect(counter?.getAttribute('aria-live')).toBe('off');
  });

  it('says so when the limit is reached', () => {
    render(<FeedbackDialog open onClose={vi.fn()} />);
    const textarea = screen.getByLabelText('Your feedback');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(FEEDBACK_MAX_LENGTH) } });
    const counter = document.getElementById(textarea.getAttribute('aria-describedby') ?? '');
    expect(counter?.textContent).toBe('Limit reached: 2,000 characters');
    expect(counter?.getAttribute('aria-live')).toBe('polite');
  });

  it('sends the screen, browser/OS and build with the message (UX-PO-05)', () => {
    render(<FeedbackDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: 'Great app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [sent] = mutate.mock.calls[0] as [Record<string, string>];
    expect(sent['message']).toBe('Great app');
    expect(sent['path']).toBe('/dashboard');
    expect(sent['route']).toBe('/dashboard');
    expect(sent['build']).toBe('Chefer web');
    expect(sent['os']).toBeTruthy();
  });
});
