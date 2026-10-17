import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShellChromeProvider, ShellTopBar } from '../../src/features/shell/shell-chrome';

// Mobile UX revamp, phase 1: the old ModeSwitch header row becomes the new
// shell's top bar — Back on a pushed screen, the tab's actions on a tab root.

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: {
    back: () => {
      mockBack();
    },
    replace: (href: unknown) => {
      mockReplace(href);
    },
    canGoBack: () => mockCanGoBack,
  },
}));
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text } = require('react-native') as typeof import('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack = true;
});

describe('ShellTopBar', () => {
  it('renders nothing outside the new shell', async () => {
    await render(<ShellTopBar />);
    expect(screen.queryByTestId('shell-back')).toBeNull();
  });

  it('renders nothing on a tab root without actions', async () => {
    await render(
      <ShellChromeProvider value={{ kind: 'tab-root' }}>
        <ShellTopBar />
      </ShellChromeProvider>,
    );
    expect(screen.queryByTestId('shell-back')).toBeNull();
  });

  it('goes back on a pushed screen', async () => {
    await render(
      <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
        <ShellTopBar />
      </ShellChromeProvider>,
    );
    await fireEvent.press(screen.getByTestId('shell-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to the tab root when there is no history', async () => {
    mockCanGoBack = false;
    await render(
      <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
        <ShellTopBar />
      </ShellChromeProvider>,
    );
    await fireEvent.press(screen.getByTestId('shell-back'));
    expect(mockReplace).toHaveBeenCalledWith('/train');
  });
});
