// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteDto } from '@chefer/types';
import { InviteList } from './InviteList';
import { qrPath } from './InviteQrCode';
import { RemoveClientButton } from './RemoveClientButton';

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ trainer: { clients: { list: { invalidate: vi.fn() } } } }),
    trainer: {
      clients: { remove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
    },
  },
}));
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

afterEach(cleanup);

const invite = (state: InviteDto['state']): InviteDto => ({
  code: `CODE${state}`.slice(0, 10),
  url: `https://chefer.app/coaching/join/${state}`,
  label: `Maria ${state}`,
  createdAt: '2026-10-17T09:00:00.000Z',
  expiresAt: '2026-10-31T09:00:00.000Z',
  state,
});

describe('invite QR code', () => {
  it('encodes the link as a square QR matrix with a quiet zone', () => {
    const { d, size } = qrPath('https://chefer.app/coaching/join/ABCD234567');
    // A QR version has 17 + 4·v modules; 4 modules of quiet zone each side.
    const modules = size - 8;
    expect(modules).toBeGreaterThanOrEqual(21);
    expect((modules - 17) % 4).toBe(0);
    expect(d.length).toBeGreaterThan(0);
    // The top-left finder pattern starts at the quiet-zone corner.
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
  });

  it('an open invite offers "Show QR code", which shows a labelled code', () => {
    render(
      <InviteList invites={[invite('OPEN'), invite('USED')]} onRevoke={vi.fn()} revoking={false} />,
    );
    const buttons = screen.getAllByRole('button', { name: /^Show QR code/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(screen.getByRole('img', { name: 'QR code of the invite' })).toBeInTheDocument();
  });
});

describe('RemoveClientButton', () => {
  it('reads "End coaching" and asks first', () => {
    render(<RemoveClientButton clientId="c1" clientName="Ada" />);
    fireEvent.click(screen.getByRole('button', { name: 'End coaching' }));
    expect(screen.getByText(/Ada keeps their routine/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'End coaching' }).length).toBeGreaterThan(0);
  });
});
