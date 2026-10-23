// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareCardButton } from './share-card-button';

// Lane E2: the web shares the card PNG through the Web Share API when it can,
// and otherwise shows the card with Download and Copy link.

const LINK = {
  id: 'abc123',
  url: 'https://chefer.test/s/abc123',
  imageUrl: 'https://chefer.test/s/abc123/image',
};

const m = vi.hoisted(() => ({ mutateAsync: vi.fn(), capture: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    share: {
      create: {
        useMutation: () => ({
          mutateAsync: m.mutateAsync,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

const INPUT = { kind: 'recipe' as const, recipeId: 'r1', showNutrition: false };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  m.mutateAsync.mockResolvedValue(LINK);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 })),
  );
});

describe('ShareCardButton (lane E2)', () => {
  it('shares the PNG with the link when the browser can share files', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    render(<ShareCardButton input={INPUT} message="Lemon pasta" />);
    fireEvent.click(screen.getByRole('button', { name: /share as a card/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(m.mutateAsync).toHaveBeenCalledWith(INPUT);
    const [data] = share.mock.calls[0] as unknown as [ShareData];
    expect(data.url).toBe(LINK.url);
    expect(data.text).toBe('Lemon pasta');
    expect(data.files?.[0]?.name).toBe('chefer-abc123.png');
    expect(m.capture).toHaveBeenCalledWith('share_card_shared', {
      kind: 'recipe',
      completed: true,
    });
  });

  it('without the Web Share API, shows the card with Download and Copy link', async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    render(<ShareCardButton input={INPUT} message="Lemon pasta" />);
    fireEvent.click(screen.getByRole('button', { name: /share as a card/i }));
    const download = await screen.findByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toBe(LINK.imageUrl);
    expect(screen.getByRole('img', { name: 'Your Chefer share card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });
});
