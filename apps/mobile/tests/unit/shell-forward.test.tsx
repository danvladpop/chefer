import { render, screen } from '@testing-library/react-native';
import { ShellV2Forward } from '../../src/features/shell/shell-forward';

// The old tab groups forward to the new shell only while one of their own
// tabs has focus. Flipping the preview on Settings (pushed over the old tabs)
// used to redirect from underneath it, leaving hardware Back nothing to pop.

let mockPathname = '/';
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    usePathname: () => mockPathname,
    useGlobalSearchParams: () => ({}),
    Redirect: ({ href }: { href: { pathname: string } | string }) => (
      <Text testID="redirect">{typeof href === 'string' ? href : href.pathname}</Text>
    ),
  };
});

describe('ShellV2Forward', () => {
  it('sends an old tab to its new home', async () => {
    mockPathname = '/more';
    await render(<ShellV2Forward />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/you');
  });

  it('uses the landing override on a cold start', async () => {
    mockPathname = '/';
    await render(<ShellV2Forward landing="/train" />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/train');
  });

  it('stays put while a screen above the old tabs has focus', async () => {
    mockPathname = '/settings';
    await render(<ShellV2Forward />);
    expect(screen.queryByTestId('redirect')).not.toBeOnTheScreen();
  });
});
