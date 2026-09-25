// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorState } from '@chefer/ui';

afterEach(cleanup);

describe('ErrorState (F-X-3-1)', () => {
  it('announces the failure and retries on click', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Couldn't load your meal plan" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your meal plan");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders a reload link for server components', () => {
    render(<ErrorState retryHref="/preferences" />);
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
      '/preferences',
    );
  });
});
