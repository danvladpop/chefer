// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerRequestDto } from '@chefer/types';
import { TrainerRequests } from './TrainerRequests';

type Callbacks = { onSuccess?: () => void; onError?: (e: unknown) => void };

const m = vi.hoisted(
  (): {
    list: TrainerRequestDto[] | undefined;
    accept: ReturnType<typeof vi.fn>;
    decline: ReturnType<typeof vi.fn>;
    invalidated: string[];
    toast: ReturnType<typeof vi.fn>;
  } => ({ list: [], accept: vi.fn(), decline: vi.fn(), invalidated: [], toast: vi.fn() }),
);

vi.mock('@/lib/app-toast', () => ({ showAppToast: m.toast }));
vi.mock('@/lib/trpc', () => {
  const inv = (key: string) => ({ invalidate: () => m.invalidated.push(key) });
  return {
    trpc: {
      useUtils: () => ({
        trainer: {
          requests: { list: inv('trainer.requests.list') },
          clients: { list: inv('trainer.clients.list') },
          status: inv('trainer.status'),
        },
        coaching: { notices: inv('coaching.notices') },
      }),
      trainer: {
        requests: {
          list: { useQuery: () => ({ data: m.list }) },
          accept: { useMutation: () => ({ mutate: m.accept }) },
          decline: { useMutation: () => ({ mutate: m.decline }) },
        },
      },
    },
  };
});

const ada: TrainerRequestDto = {
  id: 'r1',
  client: { id: 'c1', name: 'Ada Tester' },
  createdAt: '2026-10-17T09:00:00.000Z',
  expiresAt: '2026-10-31T09:00:00.000Z',
  hasTrainer: false,
};
const bob: TrainerRequestDto = {
  ...ada,
  id: 'r2',
  client: { id: 'c2', name: 'Bob' },
  hasTrainer: true,
};

beforeEach(() => {
  m.list = [ada, bob];
  m.accept.mockReset();
  m.decline.mockReset();
  m.toast.mockReset();
  m.invalidated = [];
});
afterEach(cleanup);

function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByTestId('trainer-request-row')
    .find((r) => r.textContent.includes(name));
  if (!row) throw new Error(`no request row for ${name}`);
  return row;
}

describe('TrainerRequests', () => {
  it('renders nothing without requests', () => {
    m.list = [];
    const { container } = render(<TrainerRequests />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each request with its expiry and the has-a-trainer note', () => {
    render(<TrainerRequests />);
    expect(screen.getByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(rowFor('Ada')).toHaveTextContent('Ada Tester asked you to coach them');
    expect(rowFor('Ada')).toHaveTextContent('Expires 31 Oct');
    expect(rowFor('Ada')).not.toHaveTextContent('Has a trainer now');
    expect(rowFor('Bob')).toHaveTextContent('Has a trainer now: accepting ends that coaching.');
  });

  it('Accept answers that request and refreshes requests and clients', () => {
    m.accept.mockImplementation((_input: unknown, cb: Callbacks) => cb.onSuccess?.());
    render(<TrainerRequests />);
    fireEvent.click(within(rowFor('Ada')).getByRole('button', { name: 'Accept: Ada Tester' }));
    expect(m.accept).toHaveBeenCalledWith({ requestId: 'r1' }, expect.any(Object));
    expect(m.invalidated).toEqual(
      expect.arrayContaining(['trainer.requests.list', 'trainer.clients.list']),
    );
    expect(m.toast).toHaveBeenCalledWith({ message: 'You now coach Ada Tester', type: 'success' });
  });

  it('Decline answers that request', () => {
    m.decline.mockImplementation((_input: unknown, cb: Callbacks) => cb.onSuccess?.());
    render(<TrainerRequests />);
    fireEvent.click(within(rowFor('Bob')).getByRole('button', { name: 'Decline: Bob' }));
    expect(m.decline).toHaveBeenCalledWith({ requestId: 'r2' }, expect.any(Object));
    expect(m.toast).toHaveBeenCalledWith({ message: 'Request declined', type: 'success' });
  });

  it('shows an error on the row it belongs to', () => {
    let callbacks: Callbacks = {};
    m.accept.mockImplementation((_input: unknown, cb: Callbacks) => {
      callbacks = cb;
    });
    render(<TrainerRequests />);
    fireEvent.click(within(rowFor('Ada')).getByRole('button', { name: 'Accept: Ada Tester' }));
    act(() => callbacks.onError?.(new Error('This request isn’t available')));
    expect(within(rowFor('Ada')).getByRole('alert')).toBeInTheDocument();
    expect(within(rowFor('Bob')).queryByRole('alert')).toBeNull();
  });
});
