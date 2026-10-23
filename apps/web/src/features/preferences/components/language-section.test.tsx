// @vitest-environment jsdom
import { I18nProvider } from '@/lib/i18n';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSection } from './language-section';

// ADR 0004: Preferences › Language saves on change and the page switches at once.
const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  setData: vi.fn(),
  refresh: vi.fn(),
  onSuccess: undefined as undefined | ((saved: { locale: 'en' | 'ro' | null }) => void),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { me: { setData: m.setData } } }),
    user: {
      setLocale: {
        useMutation: (opts: { onSuccess: typeof m.onSuccess }) => {
          m.onSuccess = opts.onSuccess;
          return { mutate: m.mutate, isPending: false, isError: false };
        },
      },
    },
  },
}));

function renderSection(deviceTags: string[]) {
  return render(
    <I18nProvider initialChoice={null} deviceTags={deviceTags}>
      <LanguageSection />
    </I18nProvider>,
  );
}

beforeEach(() => {
  m.mutate.mockImplementation((input: { locale: 'en' | 'ro' | null }) =>
    m.onSuccess?.({ locale: input.locale }),
  );
  document.cookie = 'chefer_locale=; path=/; max-age=0';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LanguageSection', () => {
  it('follows the browser by default and names its language', () => {
    renderSection(['en-GB']);
    expect(screen.getByRole('heading', { name: 'Language' })).toBeTruthy();
    expect(screen.getByText('Currently English')).toBeTruthy();
  });

  it('switches the page to Romanian, saves to the account and remembers it in the cookie', () => {
    renderSection(['en-GB']);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ro' } });
    expect(m.mutate).toHaveBeenCalledWith({ locale: 'ro' });
    expect(screen.getByRole('heading', { name: 'Limbă' })).toBeTruthy();
    expect(document.cookie).toContain('chefer_locale=ro');
    expect(document.documentElement.lang).toBe('ro');
    expect(m.refresh).toHaveBeenCalled();
  });

  it('"Same as my browser" saves null', () => {
    renderSection(['ro-RO']);
    fireEvent.change(screen.getByLabelText('Limbă'), { target: { value: 'en' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'auto' } });
    expect(m.mutate).toHaveBeenLastCalledWith({ locale: null });
    expect(screen.getByRole('heading', { name: 'Limbă' })).toBeTruthy();
  });
});
