// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHECK_IN_COPY, type CurrentCheckInDto } from '@chefer/types';
import { CheckInForm } from './CheckInForm';
import { CheckInPrompt } from './CheckInPrompt';

// Lane K3 on web: the Today card and /coaching/check-in (mobile twin:
// tests/unit/coaching-check-in.test.tsx).

const OPEN: CurrentCheckInDto = {
  periodStart: '2026-10-25',
  trainerName: 'Ana',
  questions: ['ENERGY', 'SLEEP'],
  answered: null,
};

const m = vi.hoisted(
  (): { current: CurrentCheckInDto | null; submit: ReturnType<typeof vi.fn> } => ({
    current: null,
    submit: vi.fn(),
  }),
);

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('../use-coaching-availability', () => ({
  useCoachingAvailability: () => ({ enabled: true }),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ coaching: { checkIn: { current: { invalidate: vi.fn() } } } }),
    coaching: {
      status: { useQuery: () => ({ data: { trainer: { name: 'Ana', since: '' } } }) },
      checkIn: {
        current: {
          useQuery: () => ({ isPending: false, isError: false, data: m.current }),
        },
        submit: {
          useMutation: () => ({ mutate: m.submit, isPending: false, error: null }),
        },
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('CheckInPrompt', () => {
  it('shows while open and unanswered, and Later hides it', () => {
    m.current = OPEN;
    render(<CheckInPrompt />);
    expect(screen.getByText(CHECK_IN_COPY.client.cardTitle('Ana'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer' })).toHaveAttribute(
      'href',
      '/coaching/check-in',
    );
    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    expect(screen.queryByTestId('coaching-check-in-prompt')).toBeNull();
  });

  it('nothing once answered', () => {
    m.current = { ...OPEN, answered: { submittedAt: '', answers: {}, note: null } };
    render(<CheckInPrompt />);
    expect(screen.queryByTestId('coaching-check-in-prompt')).toBeNull();
  });
});

describe('CheckInForm', () => {
  it('sends only once every question is answered, with the open period and the trimmed note', () => {
    m.current = OPEN;
    render(<CheckInForm />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Energy: 3 of 5' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sleep: 5 of 5' }));
    fireEvent.change(screen.getByLabelText(CHECK_IN_COPY.client.noteLabel), {
      target: { value: '  Long week ' },
    });
    fireEvent.click(send);
    expect(m.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart: '2026-10-25',
        answers: { ENERGY: 3, SLEEP: 5 },
        note: 'Long week',
      }),
    );
  });

  it('closed: says when the next one opens', () => {
    m.current = null;
    render(<CheckInForm />);
    expect(screen.getByTestId('check-in-closed')).toHaveTextContent(CHECK_IN_COPY.client.closed);
  });
});
