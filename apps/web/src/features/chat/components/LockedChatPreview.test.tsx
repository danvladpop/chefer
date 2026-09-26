// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockedChatPreview } from './LockedChatPreview';

vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: ({ source }: { source: string }) => <button data-source={source}>Upgrade</button>,
}));

afterEach(cleanup);

describe('LockedChatPreview (per-user AI is premium-only)', () => {
  it('labels the conversation as an example and offers the upgrade', () => {
    render(<LockedChatPreview />);
    expect(screen.getByText('Example conversation')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upgrade' }).getAttribute('data-source')).toBe(
      'chat-locked',
    );
  });

  it('links the free tools that do the same jobs', () => {
    render(<LockedChatPreview />);
    expect(screen.getByRole('link', { name: /Replace a meal/ }).getAttribute('href')).toBe(
      '/meal-plan',
    );
    expect(screen.getByRole('link', { name: /Quick-add/ }).getAttribute('href')).toBe('/tracker');
  });
});
