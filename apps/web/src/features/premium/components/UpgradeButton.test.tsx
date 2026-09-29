// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_PITCH_COPY } from '@chefer/utils';
import { DowngradeButton, UpgradeButton } from './UpgradeButton';

// UX-10 (T-10.5): the web upgrade dialog is headlined by the job its source
// unlocks, carries the free-for-now terms on every open, never says "beta" or
// shows a price, and the downgrade asks first — keep/lose, cancel keeps Premium.

const mocks = vi.hoisted(() => ({
  upgradeMutate: vi.fn(),
  downgradeMutate: vi.fn(),
  jobs: ['PLAN_MEALS'] as string[],
  members: [] as { name: string; isKid: boolean }[],
  usage: { aiMealPlans: 0, today: { RECIPE_IMPORT: 0, CHAT: 0, SCAN: 0 } },
  memberCount: 0,
  capture: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: mocks.capture }));
vi.mock('@/features/flags/use-flags', () => ({ useFlags: () => ({}) }));
vi.mock('@/hooks/useHousehold', () => ({
  useHousehold: () => ({ memberCount: mocks.memberCount }),
}));
vi.mock('@/features/premium/components/PostUpgradeActivation', () => ({
  ACTIVATION_EVENT: 'e',
  ACTIVATION_FLAG: 'f',
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ invalidate: vi.fn() }),
    preferences: { get: { useQuery: () => ({ data: { jobs: mocks.jobs } }) } },
    household: { list: { useQuery: () => ({ data: mocks.members }) } },
    profile: { getAiUsage: { useQuery: () => ({ data: mocks.usage }) } },
    user: {
      upgradePlan: {
        useMutation: () => ({ mutate: mocks.upgradeMutate, isPending: false, isError: false }),
      },
      downgradePlan: {
        useMutation: () => ({ mutate: mocks.downgradeMutate, isPending: false, isError: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); // the Sheet's scroll lock (jsdom has none)
  mocks.jobs = ['PLAN_MEALS'];
  mocks.members = [];
  mocks.memberCount = 0;
  mocks.usage = { aiMealPlans: 0, today: { RECIPE_IMPORT: 0, CHAT: 0, SCAN: 0 } };
});
afterEach(cleanup);

describe('UpgradeButton — a dialog that names the job', () => {
  it('opens headlined by the source’s job, with live bullets and the free-for-now terms', () => {
    render(<UpgradeButton source="recipe-import" />);
    fireEvent.click(screen.getByRole('button', { name: 'See what Premium adds' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Turn your saved links and videos into recipes')).toBeTruthy();
    expect(screen.getByText('Import from a link, pasted text or a cooking video')).toBeTruthy();
    expect(screen.getByText('FREE FOR NOW')).toBeTruthy();
    expect(screen.getByText(PREMIUM_PITCH_COPY.termsBody)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn on Premium' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith('upgrade_prompt_shown', {
      source: 'recipe-import',
      job: 'recipe-import',
    });
  });

  it('shows the terms on every open, and never says beta or shows a price', () => {
    render(<UpgradeButton source="household" />);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'See what Premium adds' }));
      expect(screen.getByText('FREE FOR NOW')).toBeTruthy();
      const text = screen.getByRole('dialog').textContent ?? '';
      expect(text).not.toMatch(/\bbeta\b/i);
      expect(text.replace(PREMIUM_PITCH_COPY.termsBody, '')).not.toMatch(
        /[€$£]|checkout|subscribe/i,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    }
  });

  it('a Train user on a default source sees the gym-first pitch — the gym stays free', () => {
    mocks.jobs = ['TRAIN'];
    render(<UpgradeButton source="profile" />);
    fireEvent.click(screen.getByRole('button', { name: 'See what Premium adds' }));
    expect(screen.getByText('Food that fits your training week')).toBeTruthy();
    expect(screen.getByText('Everything in the gym stays free')).toBeTruthy();
  });

  it('Turn on Premium flips the plan (the free toggle) and reports the click', () => {
    render(<UpgradeButton source="pantry" />);
    fireEvent.click(screen.getByRole('button', { name: 'See what Premium adds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Premium' }));
    expect(mocks.upgradeMutate).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith('upgrade_clicked', {
      source: 'pantry',
      job: 'pantry',
    });
  });

  it('a custom trigger label (the import form’s "Preview import") still opens the pitch', () => {
    render(<UpgradeButton source="recipe-import" label="Preview import" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    expect(screen.getByText('FREE FOR NOW')).toBeTruthy();
  });
});

describe('DowngradeButton — asks first (AC7)', () => {
  it('says what you keep and lists only the Premium jobs this user used', () => {
    mocks.memberCount = 2;
    mocks.usage = { aiMealPlans: 0, today: { RECIPE_IMPORT: 1, CHAT: 0, SCAN: 0 } };
    render(<DowngradeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch back to Free' }));

    expect(screen.getByText('Switch back to Free?')).toBeTruthy();
    expect(
      screen.getByText("You'll keep your plans, recipes, ratings, logs and workouts."),
    ).toBeTruthy();
    const lose = screen.getByTestId('downgrade-losses');
    expect(lose.textContent).toContain('Portions for your table');
    expect(lose.textContent).toContain('Recipe import');
    expect(lose.textContent).not.toContain('The AI chef');
    expect(mocks.downgradeMutate).not.toHaveBeenCalled();
  });

  it('Keep Premium cancels and sends nothing; Switch to Free flips the tier', () => {
    render(<DowngradeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch back to Free' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Premium' }));
    expect(mocks.downgradeMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Switch back to Free' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Free' }));
    expect(mocks.downgradeMutate).toHaveBeenCalledTimes(1);
  });
});
