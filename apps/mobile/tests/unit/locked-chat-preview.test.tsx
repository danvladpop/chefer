import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { LockedChatPreview } from '../../src/features/chat/locked-chat-preview';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('LockedChatPreview (per-user AI is premium-only)', () => {
  it('shows a labelled example and routes to the upgrade and the free tools', async () => {
    const user = userEvent.setup();
    await render(<LockedChatPreview />);
    expect(screen.getByText('Example conversation')).toBeTruthy();
    await user.press(screen.getByTestId('chat-locked-upgrade'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/profile',
      params: { source: 'chat-locked' },
    });
    await user.press(screen.getByText('Quick-add what you ate →'));
    expect(router.push).toHaveBeenCalledWith('/tracker');
  });
});
