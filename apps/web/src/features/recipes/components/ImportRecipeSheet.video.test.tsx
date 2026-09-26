// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportRecipeSheet } from './ImportRecipeSheet';

// The "Video" source: link validation, the premium lock, and the hand-off to
// recipe.importVideoPreview. The review form itself is VideoDraftForm.test.

const mocks = vi.hoisted(() => ({
  videoMutate: vi.fn(),
  isPremium: true,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ isPremium: mocks.isPremium }),
}));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: () => <button type="button">Upgrade</button>,
}));
vi.mock('@/lib/trpc', () => {
  const idle = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
  return {
    trpc: {
      useUtils: () => ({ recipe: { list: { invalidate: vi.fn() } } }),
      recipe: {
        importPreview: { useMutation: () => idle },
        importSave: { useMutation: () => idle },
        importVideoPreview: {
          useMutation: () => ({ ...idle, mutate: mocks.videoMutate }),
        },
      },
    },
  };
});

beforeEach(() => {
  mocks.videoMutate.mockClear();
  mocks.isPremium = true;
});
afterEach(cleanup);

describe('ImportRecipeSheet — video source', () => {
  it('accepts a YouTube/TikTok/Instagram link and sends it for a draft', () => {
    render(<ImportRecipeSheet open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Video/ }));
    const input = screen.getByLabelText('Video link');
    fireEvent.change(input, { target: { value: ' https://youtu.be/abcdef123 ' } });
    fireEvent.click(screen.getByText('Preview import'));
    expect(mocks.videoMutate).toHaveBeenCalledWith({ url: 'https://youtu.be/abcdef123' });
  });

  it('refuses other links before any request', () => {
    render(<ImportRecipeSheet open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Video/ }));
    fireEvent.change(screen.getByLabelText('Video link'), {
      target: { value: 'https://example.com/video.mp4' },
    });
    expect(screen.getByText('Paste a YouTube, TikTok or Instagram video link.')).toBeTruthy();
    const button = screen.getByText('Preview import').closest('button');
    expect(button?.disabled).toBe(true);
  });

  it('says what happens to the video', () => {
    render(<ImportRecipeSheet open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Video/ }));
    expect(screen.getByText(/audio is deleted right after it is transcribed/)).toBeTruthy();
  });

  it('free users get the same locked example as every other AI source', () => {
    mocks.isPremium = false;
    render(<ImportRecipeSheet open onClose={vi.fn()} />);
    expect(screen.getByTestId('import-locked')).toBeTruthy();
    expect(screen.queryByLabelText('Video link')).toBeNull();
    expect(screen.getByText(/a cookbook photo or a cooking video/)).toBeTruthy();
  });
});
