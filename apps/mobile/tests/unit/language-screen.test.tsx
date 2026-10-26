import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LanguageScreen } from '../../src/features/language/language-screen';
import { getTranslator, resetLocaleForTests } from '../../src/lib/i18n';

// ADR 0004: Settings › Language switches every screen at once and saves the
// choice to the account; "Same as my phone" follows the phone's language.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => '/settings/language',
}));

const mockMutate = jest.fn();
const mockSetData = jest.fn();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { me: { setData: mockSetData } } }),
    user: {
      setLocale: {
        useMutation: () => ({ mutate: mockMutate, isError: false, isPending: false }),
      },
    },
  },
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 320, height: 640 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LanguageScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockMutate.mockReset();
  mockSetData.mockReset();
});

describe('LanguageScreen', () => {
  it('follows the phone by default and says which language that is', async () => {
    resetLocaleForTests(['ro-RO', 'en-US']);
    await renderScreen();
    expect(screen.getByText('Limbă')).toBeTruthy();
    expect(screen.getByText('Acum: Română')).toBeTruthy();
    expect(screen.getByTestId('language-auto').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('switches the whole app at once and saves the choice to the account', async () => {
    resetLocaleForTests(['ro-RO']);
    await renderScreen();
    await fireEvent.press(screen.getByTestId('language-en'));
    expect(screen.getByText('Language')).toBeTruthy();
    // Code outside React (notification text) follows too.
    expect(getTranslator().t('common.actions.save')).toBe('Save');
    expect(mockMutate).toHaveBeenCalledWith({ locale: 'en' });
  });

  it('"Same as my phone" saves null', async () => {
    resetLocaleForTests(['en-GB']);
    await renderScreen();
    await fireEvent.press(screen.getByTestId('language-ro'));
    await fireEvent.press(screen.getByTestId('language-auto'));
    expect(mockMutate).toHaveBeenLastCalledWith({ locale: null });
    expect(getTranslator().locale).toBe('en');
  });
});
