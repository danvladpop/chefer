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
  UpgradeButton: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'See what Premium adds'}</button>
  ),
}));
// The private-ingredient sheet's image upload (env-dependent); unused here.
vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/lib/trpc', async () => {
  const { catalogIngredientsMock, catalogUtilsMock } = await import('@/test-support/catalog-trpc');
  const idle = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
  return {
    trpc: {
      useUtils: () => ({ ...catalogUtilsMock(), recipe: { list: { invalidate: vi.fn() } } }),
      ingredients: catalogIngredientsMock(),
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
// jsdom has no scrollTo; the Sheet's scroll lock restores the page offset with it.
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
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

  it('free users keep the form under a lock card, with a free path (T-10.4/T-10.5)', () => {
    mocks.isPremium = false;
    render(<ImportRecipeSheet open onClose={vi.fn()} />);
    // The lock is one card above the form — it never replaces it.
    expect(screen.getByTestId('import-locked')).toBeTruthy();
    expect(screen.getByText('Turn your saved links and videos into recipes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Video/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Video/ }));
    expect(screen.getByLabelText('Video link')).toBeTruthy();
    // "Or type it in yourself" is the free way in: the manual recipe form.
    const free = screen.getByRole('link', { name: 'Or type it in yourself' });
    expect(free.getAttribute('href')).toBe('/recipes/new');
  });
});
