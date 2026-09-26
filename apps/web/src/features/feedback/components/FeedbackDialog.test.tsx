// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_MAX_LENGTH, FeedbackDialog } from './FeedbackDialog';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate: vi.fn(),
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
});
