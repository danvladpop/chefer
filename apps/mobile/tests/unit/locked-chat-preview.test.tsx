import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { LockedChatPreview } from '../../src/features/chat/locked-chat-preview';
import { openPremium } from '../../src/features/premium/open-premium';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

describe('LockedChatPreview (per-user AI is premium-only)', () => {
  it('shows a labelled example, opens the premium sheet for chat, and links the free tools', async () => {
    const user = userEvent.setup();
    await render(<LockedChatPreview />);
    expect(screen.getByText('Example conversation')).toBeTruthy();
    await user.press(screen.getByTestId('chat-locked-upgrade'));
    expect(openPremium).toHaveBeenCalledWith('chat-locked');
    expect(router.push).not.toHaveBeenCalled();
    await user.press(screen.getByText('Quick-add what you ate →'));
    expect(router.push).toHaveBeenCalledWith('/tracker');
  });
});
